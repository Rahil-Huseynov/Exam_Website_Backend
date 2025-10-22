import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { CarsService } from '../cars/cars.service';

@Controller('paypal')
export class PaypalController {
  private readonly logger = new Logger(PaypalController.name);
  constructor(
    private readonly paypalService: PaypalService,
    private readonly carsService: CarsService,
  ) {}
  @Post('create-order')
  async createOrder(@Body() body: { amount: string; currency?: string; customId?: string }) {
    if (!body?.amount) throw new BadRequestException('amount required');
    const currency = body.currency ?? 'PLN';
    const { id, approveLink, rawResult } = await this.paypalService.createOrder(String(body.amount), currency, body.customId);
    if (!id || !approveLink) {
      this.logger.error('Could not create PayPal order', rawResult);
      throw new BadRequestException('Failed to create PayPal order');
    }
    return { id, approveLink };
  }
  @Post('capture-order')
  async captureOrder(@Body() body: { orderId: string; adId: number; days?: number }) {
    const { orderId, adId, days } = body;
    if (!orderId) throw new BadRequestException('orderId required');
    if (!adId && adId !== 0) throw new BadRequestException('adId required');
    const captureResult = await this.paypalService.captureOrder(orderId);
    const status = captureResult?.status ?? null;
    if (status !== 'COMPLETED' && status !== 'PAYER_ACTION_REQUIRED' && status !== 'APPROVED') {
      this.logger.warn(`Unexpected PayPal capture status: ${status}`, captureResult);
      throw new BadRequestException('PayPal capture was not completed');
    }
    let result;
    try {
      result = await this.carsService.markCarPremium(adId, typeof days === 'number' ? days : undefined);
    } catch (err) {
      this.logger.error('Failed to mark car premium after PayPal capture', err as any);
      throw new BadRequestException('Payment captured but failed to update ad status');
    }
    return {
      paypal: { status: status, raw: captureResult },
      updatedAd: result,
    };
  }
}
