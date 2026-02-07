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
    this.logger.log('Pending payments check started (every 10 seconds)');

    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: {
          lt: new Date(Date.now() - 30 * 1000), 
        },
      },
    });

    if (pendingPayments.length === 0) {
      return;
    }

    this.logger.log(`Found ${pendingPayments.length} pending payments to check`);

    for (const payment of pendingPayments) {
      try {
        const pollRes = await this.paymentService.checkStatus({
          order_id: payment.orderId,
          transaction: payment.transactionId ?? undefined,
        });

        const remoteStatus = pollRes.status?.toLowerCase();

        if (remoteStatus === 'success') {
          await this.paymentService.processSuccessfulPaymentFromPoll(payment, pollRes);
        } else if (remoteStatus && remoteStatus !== 'pending') {
          await this.paymentService.processFailedPayment(payment);
        }
      } catch (err) {
        this.logger.error(`Error checking payment ${payment.orderId}: ${err.message}`);
      }
    }
  }
}