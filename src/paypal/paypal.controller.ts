import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PaypalService } from './paypal.service';

@Controller('paypal')
export class PaypalController {
  constructor(private readonly paypalService: PaypalService) { }

  @Post('create-order')
  async createOrder(@Body() body: { amount: string; currency?: string; customId?: string }) {
    if (!body?.amount) throw new BadRequestException('amount required');

    const currency = body.currency ?? 'USD';
    const order = await this.paypalService.createOrder(body.amount, currency, body.customId);

    const approveLink = order.links?.find((l: any) => l.rel === 'approve')?.href;
    return { id: order.id, approveLink, result: order };
  }

  @Post('capture-order')
  async captureOrder(@Body() body: { orderID: string; adId?: number; days?: number }) {
    if (!body?.orderID) throw new BadRequestException('orderID required');

    const capture = await this.paypalService.captureOrder(body.orderID);
    const status = String(capture?.status ?? '').toUpperCase();
    const anyCompleted = capture.purchase_units
      ?.flatMap((pu: any) => pu.payments?.captures ?? [])
      .some((c: any) => String(c?.status ?? '').toUpperCase() === 'COMPLETED');

    if ((status === 'COMPLETED' || anyCompleted) && body.adId && body.days) {
    }

    return capture;
  }
}
