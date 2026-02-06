import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';

@Module({
  imports: [HttpModule],
  providers: [PaymentService, PrismaService],
  controllers: [PaymentController],
})
export class PaymentModule {}
