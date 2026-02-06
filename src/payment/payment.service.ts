import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private publicKey: string;
  private privateKey: string;
  private requestUrl: string;
  private getStatusUrl: string;
  private redirectSecret: string | undefined;

  constructor(private readonly http: HttpService, private prisma: PrismaService) {
    this.publicKey = process.env.EPOINT_PUBLIC_KEY ?? '';
    this.privateKey = process.env.EPOINT_PRIVATE_KEY ?? '';
    this.requestUrl = process.env.EPOINT_REQUEST_URL ?? '';
    this.getStatusUrl = process.env.EPOINT_GET_STATUS_URL ?? '';
    this.redirectSecret = process.env.PAYMENT_REDIRECT_SECRET;

    if (!this.publicKey) this.logger.warn('EPOINT_PUBLIC_KEY not set');
    if (!this.privateKey) {
      throw new Error('EPOINT_PRIVATE_KEY is required in environment variables');
    }
    if (!this.redirectSecret) {
      this.logger.warn('PAYMENT_REDIRECT_SECRET not set — direct frontend protection disabled');
    }
  }

  /**
   * Build base64 data from payload
   */
  private buildData(payload: Record<string, any>): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64');
  }

  /**
   * Create signature used by Epoint (sha1 then base64 on privateKey + data + privateKey)
   */
  private makeSignature(dataBase64: string): string {
    if (!this.privateKey) throw new Error('EPOINT_PRIVATE_KEY is not set');

    const s = `${this.privateKey}${dataBase64}${this.privateKey}`;
    const shaBuf = crypto.createHash('sha1').update(s).digest();
    return shaBuf.toString('base64');
  }

  /**
   * Create payment request (sends request to Epoint and persists initial response).
   * If dto contains userId it will be stored with the payment response for later crediting.
   */
  async createPayment(dto: CreatePaymentDto): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');

    try {
      const baseSuccess = process.env.SUCCESS_REDIRECT_URL ?? null;
      const baseError = process.env.ERROR_REDIRECT_URL ?? null;

      const safeSuccess =
        baseSuccess && this.redirectSecret
          ? `${baseSuccess}${baseSuccess.includes('?') ? '&' : '?'}secure=${encodeURIComponent(
              this.redirectSecret,
            )}&order_id=${encodeURIComponent(dto.order_id)}`
          : baseSuccess;
      const safeError =
        baseError && this.redirectSecret
          ? `${baseError}${baseError.includes('?') ? '&' : '?'}secure=${encodeURIComponent(
              this.redirectSecret,
            )}&order_id=${encodeURIComponent(dto.order_id)}`
          : baseError;

      const payload = {
        public_key: this.publicKey,
        amount: dto.amount,
        currency: 'AZN',
        language: 'az',
        order_id: dto.order_id,
        description: dto.description ?? '',
        success_redirect_url: safeSuccess,
        error_redirect_url: safeError,
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

      await this.prisma.paymentResponse.create({
        data: {
          userId: (dto as any).userId ?? null,
          orderId: dto.order_id,
          transactionId: resJson.transaction ?? null,
          status: resJson.status ?? null,
          rrn: resJson.rrn ?? null,
          payload: resJson,
          signature: signature,
        },
      });

      return resJson;
    } catch (err) {
      this.logger.error('createPayment error', err as any);
      throw err;
    }
  }

  /**
   * Server-to-server callback handler from Epoint.
   * - Verifies signature
   * - Creates/updates PaymentResponse
   * - If status == success, credits user balance once (idempotent)
   */
  async handleCallback(dataBase64: string, signature: string): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');

    try {
      const expectedSignature = this.makeSignature(dataBase64);
      if (expectedSignature !== signature) {
        this.logger.warn('Invalid signature on payment callback');
        throw new Error('Invalid signature');
      }

      const decoded = Buffer.from(dataBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded) as Record<string, any>;

      const transactionId: string | null = payload.transaction ?? null;
      const orderId: string | null = payload.order_id ?? null;
      const statusRaw: string | null = payload.status ?? null;
      const status = statusRaw ? String(statusRaw).toLowerCase() : null;
      const amount = payload.amount ? Number(payload.amount) : 0;

      let existing: any | null = null;
      if (transactionId) {
        existing = await this.prisma.paymentResponse.findFirst({ where: { transactionId } });
      }
      if (!existing && orderId) {
        existing = await this.prisma.paymentResponse.findFirst({ where: { orderId } });
      }

      if (existing && existing.status && String(existing.status).toLowerCase() === 'success' && status === 'success') {
        this.logger.log(`Callback: payment already recorded as success for transaction ${transactionId ?? orderId}`);
        return existing;
      }

      let pr: any;
      if (existing) {
        pr = await this.prisma.paymentResponse.update({
          where: { id: existing.id },
          data: {
            transactionId,
            status: statusRaw,
            rrn: payload.rrn ?? null,
            payload,
            signature,
          },
        });
      } else {
        pr = await this.prisma.paymentResponse.create({
          data: {
            userId: null,
            orderId,
            transactionId,
            status: statusRaw,
            rrn: payload.rrn ?? null,
            payload,
            signature,
          },
        });
      }

      if (status === 'success') {
        let userId: number | null = pr.userId ?? null;

        if (!userId && orderId) {
          const byOrder = await this.prisma.paymentResponse.findFirst({ where: { orderId } });
          if (byOrder && byOrder.userId) userId = byOrder.userId;
        }

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
            this.logger.log(`Credited user ${userId} with ${amount} AZN for transaction ${transactionId}`);
          } else {
            this.logger.log(`Balance transaction already exists for transaction ${transactionId} and user ${userId}`);
          }
        } else {
          this.logger.warn(`Success payment but userId unknown for order ${orderId} / transaction ${transactionId}`);
        }
      }

      return pr;
    } catch (err) {
      this.logger.error('handleCallback error', err as any);
      throw err;
    }
  }

  /**
   * Query Epoint for transaction/order status.
   */
  async checkStatus(transactionOrOrder: { transaction?: string; order_id?: string }): Promise<any> {
    if (!this.privateKey) throw new Error('Epoint private key missing in env');

    try {
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
    } catch (err) {
      this.logger.error('checkStatus error', err as any);
      throw err;
    }
  }

  /**
   * Verify redirect from frontend (optional protection if PAYMENT_REDIRECT_SECRET is set).
   */
  async verifyRedirect(secret?: string, orderId?: string) {
    if (!this.redirectSecret) {
      return { allowed: false, reason: 'server_no_secret' };
    }

    if (!secret || secret !== this.redirectSecret) {
      return { allowed: false, reason: 'invalid_secret' };
    }

    if (!orderId) {
      return { allowed: false, reason: 'missing_orderId' };
    }

    const payment = await this.prisma.paymentResponse.findFirst({ where: { orderId } });
    if (!payment) {
      return { allowed: false, reason: 'order_not_found' };
    }

    return { allowed: true, status: payment.status ?? null };
  }
}
