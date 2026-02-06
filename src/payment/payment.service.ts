import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  private publicKey = process.env.EPOINT_PUBLIC_KEY ?? '';
  private privateKey = process.env.EPOINT_PRIVATE_KEY ?? '';
  private requestUrl = process.env.EPOINT_REQUEST_URL ?? '';
  private getStatusUrl = process.env.EPOINT_GET_STATUS_URL ?? '';

  // Frontend redirect URLs (user visible)
  private successRedirect = process.env.FRONTEND_SUCCESS_URL ?? 'https://imtahanver.net/payment-success';
  private errorRedirect = process.env.FRONTEND_ERROR_URL ?? 'https://imtahanver.net/payment-error';
  // Epoint server-to-server result callback (must be reachable by Epoint)
  private resultUrl = process.env.RESULT_URL ?? 'https://imtahanver.net/payment-result';

  constructor(private readonly http: HttpService, private prisma: PrismaService) {
    if (!this.privateKey) {
      throw new Error('EPOINT_PRIVATE_KEY is required in env');
    }
  }

  private buildData(payload: Record<string, any>): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private makeSignature(dataBase64: string): string {
    const s = `${this.privateKey}${dataBase64}${this.privateKey}`;
    const sha = crypto.createHash('sha1').update(s).digest();
    return sha.toString('base64');
  }

  // Create payment: return epoint response (contains redirect_url etc)
  async createPayment(dto: CreatePaymentDto) {
    if (!dto.userId || !dto.order_id || !dto.amount) throw new Error('userId, order_id and amount required');

    const payload = {
      public_key: this.publicKey,
      amount: dto.amount,
      currency: 'AZN',
      language: 'az',
      order_id: dto.order_id,
      description: dto.description ?? '',
      // frontend pages where user will be redirected
      success_redirect_url: this.successRedirect,
      error_redirect_url: this.errorRedirect,
      // Epoint will POST result to this URL (server-to-server)
      result_url: this.resultUrl,
    };

    const data = this.buildData(payload);
    const signature = this.makeSignature(data);

    const form = new URLSearchParams();
    form.append('data', data);
    form.append('signature', signature);

    const resp$ = this.http.post(this.requestUrl, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const axiosRes = await lastValueFrom(resp$);
    const resJson = axiosRes.data;

    // Save initial payment (PENDING)
    await this.prisma.payment.create({
      data: {
        userId: dto.userId,
        orderId: dto.order_id,
        amount: dto.amount,
        transactionId: resJson.transaction ?? null,
        status: 'PENDING',
      },
    });

    // Also record response if available
    await this.prisma.paymentResponse.create({
      data: {
        userId: dto.userId,
        orderId: dto.order_id,
        transactionId: resJson.transaction ?? null,
        status: resJson.status ?? null,
        rrn: resJson.rrn ?? null,
        payload: resJson,
        signature,
      },
    });

    return resJson;
  }

  // Centralized success processing logic (idempotent)
  private async processSuccess(orderId: string, transactionId: string | null, amount: number, rrn?: string | null) {
    if (!orderId) throw new Error('orderId required for processing success');

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      this.logger.warn(`processSuccess: payment record not found for order ${orderId}`);
      return { message: 'payment not found' };
    }

    // If already SUCCESS, do nothing
    if (payment.status === 'SUCCESS') {
      this.logger.log(`processSuccess: already SUCCESS for order ${orderId}`);
      return { message: 'already processed' };
    }

    const noteIdentifier = `Epoint transaction ${transactionId ?? ''} order ${orderId}`;

    // Check existing balance transaction to avoid double-credit
    const existingTx = await this.prisma.balanceTransaction.findFirst({
      where: {
        userId: payment.userId,
        note: { contains: transactionId ?? orderId ?? '' },
      },
    });

    if (existingTx) {
      // Still update payment status if needed
      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'SUCCESS', transactionId: transactionId ?? payment.transactionId },
      });
      this.logger.log(`processSuccess: found existing balanceTransaction, skipping credit for order ${orderId}`);
      return { message: 'already credited' };
    }

    // perform transactional update: mark payment success + update user balance + create balanceTransaction
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: 'SUCCESS', transactionId: transactionId ?? payment.transactionId },
      });

      const user = await tx.user.findUnique({ where: { id: payment.userId } });
      if (!user) throw new Error('User not found');

      const before = Number(user.balance ?? 0);
      const after = Number((before + Number(amount)).toFixed(2));

      await tx.user.update({
        where: { id: user.id },
        data: { balance: after.toString() },
      });

      await tx.balanceTransaction.create({
        data: {
          userId: user.id,
          adminId: null,
          amount: Number(amount),
          currency: 'AZN',
          type: 'ADMIN_TOPUP',
          note: noteIdentifier,
          balanceBefore: before,
          balanceAfter: after,
          bankId: null,
          attemptId: null,
        },
      });
    });

    this.logger.log(`processSuccess: credited user ${payment.userId} for order ${orderId} amount ${amount}`);
    return { message: 'credited' };
  }

  // Handle server-to-server callback (result_url)
  async handleResultCallback(dataBase64: string, signature: string) {
    // verify signature
    const expected = this.makeSignature(dataBase64);
    if (expected !== signature) {
      this.logger.warn('Invalid signature on result callback');
      throw new Error('Invalid signature');
    }

    const decoded = Buffer.from(dataBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as any;

    const orderId: string | null = payload.order_id ?? null;
    const transaction: string | null = payload.transaction ?? null;
    const status: string | null = (payload.status ?? null) as string | null;
    const amount: number = payload.amount ? Number(payload.amount) : 0;
    const rrn: string | null = payload.rrn ?? null;

    // Save / update paymentResponse for records
    let existingResp:any = null;
    if (transaction) {
      existingResp = await this.prisma.paymentResponse.findFirst({ where: { transactionId: transaction } });
    }
    if (!existingResp && orderId) {
      existingResp = await this.prisma.paymentResponse.findFirst({ where: { orderId } });
    }

    if (existingResp && existingResp.status === 'success' && status === 'success') {
      // already processed
      return existingResp;
    }

    let pr;
    if (existingResp) {
      pr = await this.prisma.paymentResponse.update({
        where: { id: existingResp.id },
        data: { transactionId: transaction, status, rrn, payload, signature },
      });
    } else {
      pr = await this.prisma.paymentResponse.create({
        data: {
          userId: null,
          orderId,
          transactionId: transaction,
          status,
          rrn,
          payload,
          signature,
        },
      });
    }

    // If status success -> process success (idempotent)
    if (status && status.toLowerCase() === 'success' && orderId) {
      try {
        await this.processSuccess(orderId, transaction, amount, rrn);
      } catch (err) {
        this.logger.error(`Error processing success for order ${orderId}: ${err.message ?? err}`);
        // do not throw — return 200 to Epoint, but log the issue
      }
    } else if (orderId) {
      // mark payment as failed if present
      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'FAILED', transactionId: transaction ?? undefined },
      });
    }

    return pr;
  }

  // Called by frontend when user lands on frontend success page.
  // This will call epoint get-status API to confirm the true status, then process
  async confirmAndProcess(order_id: string, transaction?: string) {
    if (!order_id) throw new Error('order_id required');

    // Call Epoint get-status
    const payload: any = { public_key: this.publicKey, order_id };
    if (transaction) payload.transaction = transaction;

    const data = this.buildData(payload);
    const signature = this.makeSignature(data);
    const form = new URLSearchParams();
    form.append('data', data);
    form.append('signature', signature);

    const resp$ = this.http.post(this.getStatusUrl, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const axiosRes = await lastValueFrom(resp$);
    const resJson = axiosRes.data;

    // resJson should contain status and amount etc. Follow same processing rules as callback
    const status = resJson.status ?? null;
    const transactionId = resJson.transaction ?? transaction ?? null;
    const amount = resJson.amount ? Number(resJson.amount) : 0;
    const rrn = resJson.rrn ?? null;

    if (status && String(status).toLowerCase() === 'success') {
      return await this.processSuccess(order_id, transactionId, amount, rrn);
    } else {
      // mark failed
      await this.prisma.payment.update({
        where: { orderId: order_id },
        data: { status: 'FAILED', transactionId: transactionId ?? undefined },
      });
      return { message: 'not success' };
    }
  }
}
