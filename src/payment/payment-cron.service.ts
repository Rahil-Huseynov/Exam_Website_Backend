import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentCronService implements OnModuleInit {
  private readonly logger = new Logger(PaymentCronService.name);
  private readonly MAIN_JOB_NAME = 'paymentMainJob';

  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
    private schedulerRegistry: SchedulerRegistry,
  ) { }

  async onModuleInit() {
    try {
      this.logger.log('onModuleInit start: pending sayını yoxlayıram...');
      const pendingCount = await this.prisma.payment.count({
        where: { status: PaymentStatus.PENDING },
      });
      this.logger.log(`onModuleInit: pendingCount = ${pendingCount}`);

      if (pendingCount > 0) {
        this.logger.log(`Başlanğıcda ${pendingCount} pending var — əsas cron işə düşür.`);
        this.registerAndStartMainJob();
      } else {
        this.logger.log('Başlanğıcda pending yoxdur — əsas cron işə salınmadı.');
      }
    } catch (err) {
      this.logger.error('onModuleInit yoxlamasında xəta: ' + (err?.message ?? err));
      this.logger.debug(err?.stack ?? '');
    }
  }

  @Cron('0 * * * * *') 
  async checkPendingExistence() {
    try {
      this.logger.debug('Checker cron start: pending sayını alıram...');
      const pendingCount = await this.prisma.payment.count({
        where: { status: PaymentStatus.PENDING },
      });
      this.logger.debug(`Checker cron: pendingCount = ${pendingCount}`);

      const mainJobExists = this.jobExists();
      this.logger.debug(`Checker cron: mainJobExists = ${mainJobExists}`);

      if (pendingCount > 0 && !mainJobExists) {
        this.logger.log(`DB-də ${pendingCount} pending tapıldı — əsas cron qeydiyyatdan keçirilir və işə düşür.`);
        this.registerAndStartMainJob();
      } else if (pendingCount === 0 && mainJobExists) {
        this.logger.log('DB-də pending yoxdur — əsas cron dayanır və deregister edilir.');
        this.stopAndRemoveMainJob();
      } else {
        this.logger.verbose(`Checker: vəziyyət dəyişmədi (pendingCount=${pendingCount}, mainJobExists=${mainJobExists})`);
      }
    } catch (err) {
      this.logger.error('checkPendingExistence xəta: ' + (err?.message ?? err));
      this.logger.debug(err?.stack ?? '');
    }
  }

  private registerAndStartMainJob() {
    if (this.jobExists()) {
      this.logger.debug('registerAndStartMainJob: Main job artıq qeydiyyatdadır — start etməyi atladım.');
      return;
    }

    this.logger.log('registerAndStartMainJob: Main job yaradılır və start edilir (every 10s).');

    const job = new CronJob('*/10 * * * * *', async () => {
      try {
        await this.runPendingPayments();
      } catch (err) {
        this.logger.error('Main job icrasında xəta: ' + (err?.message ?? err));
        this.logger.debug(err?.stack ?? '');
      }
    });

    this.schedulerRegistry.addCronJob(this.MAIN_JOB_NAME, job);
    job.start();
    this.logger.log('Main payment cron job started (every 10s).');
  }

  private stopAndRemoveMainJob() {
    try {
      const job = this.schedulerRegistry.getCronJob(this.MAIN_JOB_NAME);
      job.stop();
      this.schedulerRegistry.deleteCronJob(this.MAIN_JOB_NAME);
      this.logger.log('Main payment cron job stopped and removed from registry.');
    } catch (err) {
      this.logger.debug('stopAndRemoveMainJob: job tapilmadi ya artıq silinib.');
    }
  }

  private jobExists(): boolean {
    try {
      this.schedulerRegistry.getCronJob(this.MAIN_JOB_NAME);
      return true;
    } catch {
      return false;
    }
  }

  private fmtPayment(payment: any) {
    if (!payment) return 'null';
    return `id=${payment.id}, orderId=${payment.orderId}, status=${payment.status}, amount=${payment.amount?.toString?.() ?? payment.amount}, createdAt=${payment.createdAt?.toISOString?.() ?? payment.createdAt}, updatedAt=${payment.updatedAt?.toISOString?.() ?? payment.updatedAt}, userId=${payment.userId}`;
  }

  private async runPendingPayments() {
    this.logger.debug('runPendingPayments start');

    const twentySecondsAgo = new Date(Date.now() - 20 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    this.logger.debug(`runPendingPayments: twentySecondsAgo=${twentySecondsAgo.toISOString()}, threeDaysAgo=${threeDaysAgo.toISOString()}`);

    let pendingPayments;
    try {
      pendingPayments = await this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PENDING,
          OR: [
            { createdAt: { lt: twentySecondsAgo } },
            { updatedAt: { lt: threeDaysAgo } },
          ],
        },
      });
      this.logger.log(`runPendingPayments: ${pendingPayments.length} pending ödəniş tapıldı.`);
    } catch (err) {
      this.logger.error('runPendingPayments: DB-dən pending-ləri alarkən xəta: ' + (err?.message ?? err));
      this.logger.debug(err?.stack ?? '');
      return;
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      this.logger.debug('runPendingPayments: yoxlanacaq pending tapilmadi -> return');
      return;
    }

    for (const payment of pendingPayments) {
      this.logger.log(`Processing payment: ${this.fmtPayment(payment)}`);
      try {
        if (payment.updatedAt < threeDaysAgo) {
          this.logger.log(`Payment ${payment.orderId} üçün updatedAt 3 gündən köhnədir -> avtomatik FAILED etməyə çalışıram.`);
          this.logger.debug(`Before updateMany: ${this.fmtPayment(payment)}`);

          const updateResult = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED, updatedAt: new Date() },
          });

          this.logger.debug(`updateMany nəticəsi (3-day-fail) for ${payment.id}: ${JSON.stringify(updateResult)}`);

          if (updateResult.count > 0) {
            const updatedPayment = await this.prisma.payment.findUnique({
              where: { id: payment.id },
            });

            if (!updatedPayment) {
              this.logger.error(`updatedPayment tapılmadı: ${payment.id}`);
              continue;
            }

            await this.paymentService.processFailedPayment(updatedPayment);
            this.logger.log(`Ödəniş avtomatik FAILED edildi (3 gün): ${payment.orderId} -> ${this.fmtPayment(updatedPayment)}`);
            try {
              const res = await this.paymentService.processFailedPayment(updatedPayment);
              this.logger.log(`processFailedPayment çağırışından sonra (${payment.orderId}) qaytarılan nəticə: ${typeof res === 'undefined' ? 'undefined' : JSON.stringify(res)}`);
            } catch (procErr) {
              this.logger.error(`processFailedPayment icrasında xəta for ${payment.orderId}: ${procErr?.message ?? procErr}`);
              this.logger.debug(procErr?.stack ?? '');
            }
          } else {
            this.logger.warn(`updateMany count=0 oldu (3-day-fail) — başqa proses payment-i dəyişdirib: ${payment.orderId}`);
          }

          continue;
        }

        this.logger.debug(`Polling bank status for orderId=${payment.orderId} ...`);
        let pollRes;
        try {
          pollRes = await this.paymentService.checkStatus({ order_id: payment.orderId });
          this.logger.log(`Poll cavabı for ${payment.orderId}: ${JSON.stringify(pollRes)}`);
        } catch (pollErr) {
          this.logger.error(`checkStatus çağırışında xəta for ${payment.orderId}: ${pollErr?.message ?? pollErr}`);
          this.logger.debug(pollErr?.stack ?? '');
          continue; 
        }

        const pollStatus = (pollRes?.status ?? '').toString().toLowerCase?.() ?? '';

        if (pollStatus === 'success') {
          this.logger.log(`Poll nəticəsi SUCCESS olan payment: ${payment.orderId} -> processSuccessfulPaymentFromPoll çağırılır.`);
          try {
            const res = await this.paymentService.processSuccessfulPaymentFromPoll(payment, pollRes);
            this.logger.log(`processSuccessfulPaymentFromPoll nəticəsi for ${payment.orderId}: ${typeof res === 'undefined' ? 'undefined' : JSON.stringify(res)}`);
          } catch (procErr) {
            this.logger.error(`processSuccessfulPaymentFromPoll icrasında xəta for ${payment.orderId}: ${procErr?.message ?? procErr}`);
            this.logger.debug(procErr?.stack ?? '');
          }
        } else if (pollStatus && pollStatus !== 'pending') {
          this.logger.log(`Poll nəticəsi pending deyil və success də deyil (${pollStatus}) -> payment FAILED ediləcək: ${payment.orderId}`);

          const updateResult = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED, updatedAt: new Date() },
          });

          this.logger.debug(`updateMany nəticəsi (failed-via-poll) for ${payment.id}: ${JSON.stringify(updateResult)}`);

          if (updateResult.count > 0) {
            const updatedPayment = await this.prisma.payment.findUnique({
              where: { id: payment.id },
            });

            if (!updatedPayment) {
              this.logger.error(`updatedPayment tapılmadı: ${payment.id}`);
              continue;
            }

            await this.paymentService.processFailedPayment(updatedPayment);
            this.logger.log(`Payment güncəlləndi və FAILED edildi (poll): ${payment.orderId} -> ${this.fmtPayment(updatedPayment)}`);
            try {
              const res = await this.paymentService.processFailedPayment(updatedPayment);
              this.logger.log(`processFailedPayment nəticəsi (poll-failed) for ${payment.orderId}: ${typeof res === 'undefined' ? 'undefined' : JSON.stringify(res)}`);
            } catch (procErr) {
              this.logger.error(`processFailedPayment icrasında xəta (poll-failed) for ${payment.orderId}: ${procErr?.message ?? procErr}`);
              this.logger.debug(procErr?.stack ?? '');
            }
          } else {
            this.logger.warn(`updateMany count=0 oldu (poll-failed) — başqa proses payment-i dəyişdirib: ${payment.orderId}`);
          }
        } else {
          this.logger.debug(`Poll status for ${payment.orderId} is "${pollRes?.status ?? 'undefined'}" — heç nə etmirəm (pending).`);
        }
      } catch (err) {
        this.logger.error(`Ümumi processing xətası for ${payment.orderId}: ${err?.message ?? err}`);
        this.logger.debug(err?.stack ?? '');
      }
    }

    this.logger.debug('runPendingPayments end');
  }
}
