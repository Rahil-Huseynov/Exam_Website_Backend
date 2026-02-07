import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CallbackDto } from './dto/callback.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly svc: PaymentService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('create')
  async create(@Body() dto: CreatePaymentDto) {
    return await this.svc.createPayment(dto);
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async callback(@Body() dto: CallbackDto) {
    try {
      await this.svc.handleCallback(dto.data, dto.signature);
      return { status: 'ok' };
    } catch (err) {
      this.logger.error(`Callback error: ${err.message}`);
      return { status: 'error', message: err.message };
    }
  }

  @Post('check-status')
  async checkStatus(@Body() body: { transaction?: string; order_id?: string }) {
    return await this.svc.checkStatus(body);
  }

  @Get('verify-redirect')
  async verifyRedirect(
    @Query('orderId') orderId: string,
    @Query('transaction') transaction?: string,
    @Query('expect') expect?: string,
  ) {
    if (!orderId) return { allowed: false };

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) return { allowed: false };

    const pollRes = await this.svc.checkStatus({ order_id: orderId, transaction });
    const remoteStatus = pollRes.status?.toLowerCase();
    const expected = expect?.toLowerCase() ?? 'success';

    let allowed = false;

    if (remoteStatus === 'success') {
      await this.svc.processSuccessfulPaymentFromPoll(payment, pollRes);
      allowed = expected === 'success';
    } else if (remoteStatus && remoteStatus !== 'pending') {
      await this.svc.processFailedPayment(payment);
      allowed = expected === 'failed';
    } else {
      allowed = payment.status === PaymentStatus.SUCCESS && expected === 'success';
    }

    return { allowed };
  }
}