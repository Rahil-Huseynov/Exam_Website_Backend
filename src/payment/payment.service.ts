import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private publicKey: string;
  private privateKey: string;
  private requestUrl: string;
  private getStatusUrl: string;

  constructor(private readonly http: HttpService, private prisma: PrismaService) {
    this.publicKey = process.env.EPOINT_PUBLIC_KEY ?? '';
    this.privateKey = process.env.EPOINT_PRIVATE_KEY ?? '';
    this.requestUrl = process.env.EPOINT_REQUEST_URL ?? '';
    this.getStatusUrl = process.env.EPOINT_GET_STATUS_URL ?? '';

    if (!this.privateKey) {
      throw new Error('EPOINT_PRIVATE_KEY is required in environment variables');
    }
  }

  private makeSignature(dataBase64: string): string {
    const s = `${this.privateKey}${dataBase64}${this.privateKey}`;
    const shaBuf = crypto.createHash('sha1').update(s).digest();
    return shaBuf.toString('base64');
  }

  private buildData(payload: Record<string, any>): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64');
  }

  async createPayment(dto: CreatePaymentDto): Promise<any> {
    if (!dto.userId) throw new Error('userId is required to create payment');
    if (!dto.order_id) throw new Error('order_id is required');
    if (!dto.amount || Number(dto.amount) <= 0) throw new Error('amount must be > 0');

    const oneTimeToken = crypto.randomBytes(24).toString('hex');

    const payment = await this.prisma.payment.create({
      data: {
        user: { connect: { id: dto.userId } },
        orderId: dto.order_id,
        amount: dto.amount,
        currency: 'AZN',
        status: PaymentStatus.PENDING,
        oneTimeToken,
        tokenConsumed: false,
      },
    });

    const payload = {
      public_key: this.publicKey,
      amount: dto.amount,
      currency: 'AZN',
      language: 'az',
      order_id: dto.order_id,
      description: dto.description ?? '',
      success_redirect_url: process.env.SUCCESS_REDIRECT_URL ?? null,
      error_redirect_url: process.env.ERROR_REDIRECT_URL ?? null,
    };

    const data = this.buildData(payload);
    const signature = this.makeSignature(data);

    const form = new URLSearchParams();
    form.append('data', data);
    form.append('signature', signature);

    try {
      const resp$ = this.http.post(this.requestUrl, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20_000,
      });
      const axiosRes = await lastValueFrom(resp$);
      const resJson = axiosRes.data;

      try {
        await this.prisma.paymentResponse.create({
          data: {
            userId: dto.userId,
            orderId: dto.order_id,
            transactionId: resJson.transaction ?? null,
            status: resJson.status ?? 'pending',
            rrn: resJson.rrn ?? null,
            payload: resJson,
            signature,
          },
        });
      } catch (e) {
        this.logger.warn('Failed to write paymentResponse: ' + String(e));
      }

      if (resJson.status === 'success' && resJson.transaction) {
        try {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { transactionId: resJson.transaction },
          });
        } catch (e) {
          this.logger.warn('Failed to update payment transactionId: ' + String(e));
        }
      }

      return {
        epoint: resJson,
        oneTimeToken,
        orderId: dto.order_id,
        redirect_url: resJson.data?.redirect_url ?? resJson.redirect_url ?? null,
      };
    } catch (err: any) {
      this.logger.error(`createPayment: Epoint request failed for order ${dto.order_id}: ${err?.message ?? err}`);
      try {
        await this.prisma.paymentResponse.create({
          data: {
            userId: dto.userId,
            orderId: dto.order_id,
            transactionId: null,
            status: 'error',
            rrn: null,
            payload: { error: err?.message ?? String(err) },
            signature,
          },
        });
      } catch (e) {
        this.logger.warn('Failed to write failed paymentResponse: ' + String(e));
      }
      throw err;
    }
  }
  async handleCallback(dataBase64: string, signature: string): Promise<any> {
    const expectedSignature = this.makeSignature(dataBase64);
    const expectedBuf = Buffer.from(expectedSignature);
    const providedBuf = Buffer.from(signature);
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      this.logger.warn('handleCallback: invalid signature');
      throw new Error('Invalid signature');
    }

    const decoded = Buffer.from(dataBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as Record<string, any>;

    const transactionId = payload.transaction ?? null;
    const orderId = payload.order_id ?? null;
    const remoteStatus = (payload.status ?? '').toLowerCase();
    const amount = payload.amount ? Number(payload.amount) : 0;

    if (!orderId) throw new Error('No orderId in callback payload');

    let payment = await this.prisma.payment.findFirst({
      where: { OR: [{ orderId }, { transactionId }] },
    });

    if (!payment) {
      this.logger.warn(`handleCallback: fallback payment creation for order ${orderId}`);
      const initRes = await this.prisma.paymentResponse.findFirst({ where: { orderId } });
      const userId = initRes?.userId ?? null;
      if (userId) {
        payment = await this.prisma.payment.create({
          data: {
            user: { connect: { id: userId } },
            orderId,
            transactionId,
            amount,
            currency: 'AZN',
            status: remoteStatus === 'success' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
          },
        });
      } else {
        await this.prisma.paymentResponse.create({
          data: {
            userId: null,
            orderId,
            transactionId,
            status: remoteStatus,
            rrn: payload.rrn ?? null,
            payload,
            signature,
          },
        });
        this.logger.warn(`handleCallback: no user found for order ${orderId}, stored paymentResponse only`);
        return { status: 'ok' };
      }
    } else {
      const newStatus = remoteStatus === 'success' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      if (payment.status === PaymentStatus.SUCCESS && newStatus === PaymentStatus.FAILED) {
        this.logger.log(`handleCallback: received FAILED but payment ${payment.orderId} already SUCCESS — ignoring downgrade`);
      } else {
        payment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            transactionId: transactionId ?? payment.transactionId,
          },
        });
      }
    }

    let existingResponse = await this.prisma.paymentResponse.findFirst({
      where: { OR: [{ transactionId }, { orderId }] },
    });

    if (existingResponse) {
      await this.prisma.paymentResponse.update({
        where: { id: existingResponse.id },
        data: {
          transactionId,
          status: remoteStatus,
          rrn: payload.rrn ?? null,
          payload,
          signature,
        },
      });
    } else {
      await this.prisma.paymentResponse.create({
        data: {
          userId: payment?.userId ?? null,
          orderId,
          transactionId,
          status: remoteStatus,
          rrn: payload.rrn ?? null,
          payload,
          signature,
        },
      });
    }

    if (remoteStatus === 'success' && payment && payment.userId) {
      await this.processPaymentSuccessAtomic(payment.id, payment.userId, amount, transactionId, orderId);
    }

    return { status: 'ok' };
  }

  private async processPaymentSuccessAtomic(
    paymentId: string,
    userId: number,
    amount: number,
    transactionId: string | null,
    orderId: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const searchConditions: any[] = [];
      if (transactionId) searchConditions.push({ note: { contains: transactionId } });
      if (orderId) searchConditions.push({ note: { contains: orderId } });

      const existing = searchConditions.length
        ? await tx.balanceTransaction.findFirst({
            where: {
              userId,
              OR: searchConditions,
            },
          })
        : null;

      if (existing) {
        this.logger.log(`processPaymentSuccessAtomic: already credited for user=${userId} (${transactionId ?? orderId})`);
        try {
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: PaymentStatus.SUCCESS,
              transactionId: transactionId ?? undefined,
            },
          });
        } catch (e) {
          this.logger.warn(String(e));
        }
        return;
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const before = Number(user.balance ?? 0);
      const afterNum = Number((before + Number(amount)).toFixed(2));

      await tx.user.update({
        where: { id: userId },
        data: { balance: afterNum.toString() },
      });

      const noteParts = [
        orderId ? `${orderId}` : null,
      ].filter(Boolean).join(' ');

      await tx.balanceTransaction.create({
        data: {
          userId,
          adminId: null,
          amount,
          currency: 'AZN',
          type: 'USER_TOPUP',
          note: `Epoint transaction: ${noteParts}`,
          balanceBefore: before,
          balanceAfter: afterNum,
          bankId: null,
          attemptId: null,
        },
      });

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.SUCCESS,
          transactionId: transactionId ?? undefined,
        },
      });

      this.logger.log(`processPaymentSuccessAtomic: Credited ${amount} AZN to user ${userId} (order=${orderId} tx=${transactionId})`);
    });
  }

  async checkStatus(transactionOrOrder: { transaction?: string; order_id?: string }): Promise<any> {
    const payload: Record<string, any> = { public_key: this.publicKey };
    if (transactionOrOrder.transaction) payload.transaction = transactionOrOrder.transaction;
    if (transactionOrOrder.order_id) payload.order_id = transactionOrOrder.order_id;

    const data = this.buildData(payload);
    const signature = this.makeSignature(data);

    const form = new URLSearchParams();
    form.append('data', data);
    form.append('signature', signature);

    const resp$ = this.http.post(this.getStatusUrl, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const axiosRes = await lastValueFrom(resp$);
    const pollRes = axiosRes.data;
    const remoteStatus = pollRes?.status?.toLowerCase();

    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          transactionOrOrder.transaction ? { transactionId: transactionOrOrder.transaction } : undefined,
          transactionOrOrder.order_id ? { orderId: transactionOrOrder.order_id } : undefined,
        ].filter(Boolean) as any[],
      },
    });

    if (!payment) {
      return { status: remoteStatus ?? 'failed' };
    }

    if (remoteStatus === 'success') {
      if (payment.status === PaymentStatus.PENDING) {
        await this.processSuccessfulPaymentFromPoll(payment, pollRes);
      }
      return { status: 'success' };
    }

    if (remoteStatus === 'failed') {
      if (payment.status === PaymentStatus.PENDING) {
        await this.processFailedPayment(payment);
      }
      return { status: 'failed' };
    }

    return { status: 'pending' };
  }

  public async processSuccessfulPaymentFromPoll(payment: Payment, pollResponse: any) {
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(`processSuccessfulPaymentFromPoll: Payment ${payment.orderId} already processed (status: ${payment.status})`);
      return;
    }

    const transactionId = pollResponse.transaction ?? payment.transactionId ?? null;
    const amount = pollResponse.amount ? Number(pollResponse.amount) : Number((payment as any).amount ?? 0);

    await this.processPaymentSuccessAtomic(payment.id, payment.userId, amount, transactionId, payment.orderId);

    this.logger.log(`Fallback (poll/cron): Credited ${amount} AZN for order ${payment.orderId}`);
  }

  public async processFailedPayment(payment: Payment) {
    if (payment.status === PaymentStatus.PENDING) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      this.logger.log(`processFailedPayment: Marked ${payment.orderId} as FAILED`);
    } else {
      this.logger.log(`processFailedPayment: payment ${payment.orderId} not PENDING (${payment.status}) — skipping`);
    }
  }
}
