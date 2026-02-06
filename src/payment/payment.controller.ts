import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CallbackDto } from './dto/callback.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  @Post('create')
  async create(@Body() dto: CreatePaymentDto) {
    const res = await this.svc.createPayment(dto);
    return res;
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async callback(@Body() dto: CallbackDto) {
    try {
      const saved = await this.svc.handleCallback(dto.data, dto.signature);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: err.message || String(err) };
    }
  }

  @Post('check-status')
  async checkStatus(@Body() body: { transaction?: string; order_id?: string }) {
    return await this.svc.checkStatus(body);
  }
}
