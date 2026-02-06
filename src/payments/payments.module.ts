import { Module } from '@nestjs/common';
import { PaymentController } from './payments.controller'; 
import { PaymentService } from './payments.service'; 
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [PaymentController],
  providers: [PaymentService, PrismaService],
})
export class PaymentsModule {}