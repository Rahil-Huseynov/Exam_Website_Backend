// payment-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentCronService {
  private readonly logger = new Logger(PaymentCronService.name);

  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
  ) {}

  @Cron('*/10 * * * * *') 
  async handlePendingPayments() {
    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { lt: new Date(Date.now() - 30 * 1000) }, 
      },
    });

    if (pendingPayments.length === 0) return;

    this.logger.log(`Checking ${pendingPayments.length} pending payments`);

    for (const payment of pendingPayments) {
      try {
        const pollRes = await this.paymentService.checkStatus({
          order_id: payment.orderId,
        });

        if (pollRes.status?.toLowerCase() === 'success') {
          await this.paymentService.processSuccessfulPaymentFromPoll(payment, pollRes);
        } else if (pollRes.status && pollRes.status.toLowerCase() !== 'pending') {
          await this.paymentService.processFailedPayment(payment);
        }
      } catch (err) {
        this.logger.error(`Check error for ${payment.orderId}: ${err.message}`);
      }
    }
  }
}