import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CallbackDto } from './dto/callback.dto';
import { ConfirmDto } from './dto/confirm.dto';

@Controller('payment') // backend API prefix (adjust as your app uses)
export class PaymentController {
  constructor(private readonly svc: PaymentService) { }

  @Post('create')
  async create(@Body() dto: CreatePaymentDto) {
    return await this.svc.createPayment(dto);
  }

  // Epoint server-to-server callback (result_url)
  // Configure in Epoint dashboard as: https://imtahanver.net/payment-result
  @Post('result')
  @HttpCode(HttpStatus.OK)
  async result(@Body() dto: CallbackDto) {
    try {
      const saved = await this.svc.handleResultCallback(dto.data, dto.signature);
      return { status: 'ok' };
    } catch (err) {
      // Return 200 to Epoint but include error message optionally — better to log and return ok
      return { status: 'error', message: err.message ?? String(err) };
    }
  }

  // Called by frontend when user has been redirected to frontend success page.
  // Frontend should call this endpoint to ensure server confirms status and credits balance safely.
  @Post('confirm')
  async confirm(@Body() body: ConfirmDto) {
    return await this.svc.confirmAndProcess(body.order_id, body.transaction);
  }

  // Optional: check status manually
  @Post('check-status')
  async checkStatus(@Body() body: { transaction?: string; order_id?: string }) {
    if (!body.order_id) {
      throw new Error('order_id is required');
    }
    return await this.svc.confirmAndProcess(body.order_id, body.transaction);
  }

}
