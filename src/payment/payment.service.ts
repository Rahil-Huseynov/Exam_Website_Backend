import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponse, Payment } from '@prisma/client'; 

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

    if (!this.publicKey) this.logger.warn('EPOINT_PUBLIC_KEY not set');
    if (!this.privateKey) {
      throw new Error('EPOINT_PRIVATE_KEY is required in environment variables');
    }
  }

  private makeSignature(dataBase64: string): string {
    if (!this.privateKey) throw new Error('EPOINT_PRIVATE_KEY is not set');
    const s = `${this.privateKey}${dataBase64}${this.privateKey}`;
    const shaBuf = crypto.createHash('sha1').update(s).digest();
    return shaBuf.toString('base64');
  }

  private buildData(payload: Record<string, any>): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64');
  }

  async createPayment(dto: CreatePaymentDto): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');
    if (!dto.userId) throw new Error('userId is required to create payment');

    const payment = await this.prisma.payment.create({
      data: {
        user: {
          connect: { id: dto.userId },
        },
        orderId: dto.order_id,
        amount: dto.amount,
        currency: 'AZN',
        status: 'PENDING',
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

    const resp$ = this.http.post(this.requestUrl, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const axiosRes = await lastValueFrom(resp$);
    const resJson = axiosRes.data;

    if (resJson.status === 'success' && resJson.transaction) {
      await this.prisma.payment.update({
        where: { orderId: dto.order_id },
        data: { transactionId: resJson.transaction },
      });
    }

    await this.prisma.paymentResponse.create({
      data: {
        userId: dto.userId,
        orderId: dto.order_id,
        transactionId: resJson.transaction ?? null,
        status: resJson.status ?? 'pending', 
        rrn: resJson.rrn ?? null,
        payload: resJson,
        signature: signature,
      },
    });

    return resJson;
  }

  async handleCallback(dataBase64: string, signature: string): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');

    const expectedSignature = this.makeSignature(dataBase64);
    if (expectedSignature !== signature) {
      throw new Error('Invalid signature');
    }

    const decoded = Buffer.from(dataBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as Record<string, any>;

    const transactionId: string | null = payload.transaction ?? null;
    const orderId: string | null = payload.order_id ?? null;
    const status: string | null = payload.status?.toLowerCase() ?? null;
    const amount = payload.amount ? Number(payload.amount) : 0;

    if (!orderId) {
      throw new Error('No orderId in callback payload');
    }

    let payment: Payment | null = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { orderId: orderId ?? undefined },
          { transactionId: transactionId ?? undefined },
        ],
      },
    });

    if (!payment) {
      this.logger.warn(`No Payment found for order ${orderId} / transaction ${transactionId}`);
      const initResponse = await this.prisma.paymentResponse.findFirst({
        where: { orderId },
      });
      const userId = initResponse?.userId ?? null;
      if (userId !== null) {
        payment = await this.prisma.payment.create({
          data: {
            user: {
              connect: { id: userId },
            },
            orderId: orderId,
            transactionId: transactionId ?? null,
            amount: amount,
            currency: 'AZN',
            status: status === 'success' ? 'SUCCESS' : 'FAILED',
          },
        });
      } else {
        this.logger.warn(`No userId found for fallback payment creation for order ${orderId}`);
      }
    } else {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: status === 'success' ? 'SUCCESS' : 'FAILED',
          transactionId: transactionId ?? payment.transactionId,
        },
      });
    }

    let existingResponse: PaymentResponse | null = null;
    if (transactionId) {
      existingResponse = await this.prisma.paymentResponse.findFirst({
        where: { transactionId },
      });
    }
    if (!existingResponse && orderId) {
      existingResponse = await this.prisma.paymentResponse.findFirst({
        where: { orderId },
      });
    }

    let pr: PaymentResponse;
    if (existingResponse) {
      pr = await this.prisma.paymentResponse.update({
        where: { id: existingResponse.id },
        data: {
          transactionId,
          status,
          rrn: payload.rrn ?? null,
          payload,
          signature,
        },
      });
    } else {
      pr = await this.prisma.paymentResponse.create({
        data: {
          userId: payment?.userId ?? null,
          orderId,
          transactionId,
          status,
          rrn: payload.rrn ?? null,
          payload,
          signature,
        },
      });
    }

    if (status === 'success') {
      const userId = payment?.userId ?? null;
      if (userId) {
        const existingTx = await this.prisma.balanceTransaction.findFirst({
          where: {
            note: { contains: transactionId ?? '' },
            userId,
          },
        });

        if (!existingTx) {
          await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user) throw new Error('User not found to credit balance');

            const before = Number(user.balance);
            const after = Number((before + amount).toFixed(2));

            await tx.user.update({
              where: { id: userId },
              data: { balance: after.toString() },
            });

            await tx.balanceTransaction.create({
              data: {
                userId,
                adminId: null,
                amount: amount,
                currency: 'AZN',
                type: 'ADMIN_TOPUP', 
                note: `Epoint transaction ${transactionId ?? ''}`,
                balanceBefore: before,
                balanceAfter: after,
                bankId: null,
                attemptId: null,
              },
            });
          });
        }
      } else {
        this.logger.warn(`Success payment but userId unknown for order ${orderId} / transaction ${transactionId}`);
      }
    }

    return pr;
  }

  async checkStatus(transactionOrOrder: { transaction?: string; order_id?: string }): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');

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
    return axiosRes.data;
  }
}