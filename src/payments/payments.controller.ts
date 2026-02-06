import { Controller, Post, Body } from '@nestjs/common';
import { PaymentService } from './payments.service';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('initiate')
  async initiate(@Body() body: { userId: number; amount: number; orderId: string; description: string }) {
    return this.paymentService.generatePaymentData(body.userId, body.amount, body.orderId, body.description);
  }

  @Post('callback')
  async callback(@Body() body: { data: string; signature?: string }) {
    return this.paymentService.handleCallback(body);
  }

  @Post('status')
  async getStatus(@Body() body: { transaction: string }) {
    return this.paymentService.getPaymentStatus(body.transaction);
  }
}