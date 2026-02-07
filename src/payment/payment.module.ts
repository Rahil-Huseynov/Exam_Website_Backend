import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentCronService } from './payment-cron.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentCronService, PrismaService],
})
export class PaymentModule {}