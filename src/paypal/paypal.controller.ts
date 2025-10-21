import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { CarsService } from 'src/cars/cars.service';

@Controller('paypal')
export class PaypalController {
  constructor(
    private readonly paypalService: PaypalService,
    private readonly carsService: CarsService,
  ) { }

  @Post('create-order')
  async createOrder(@Body() body: { amount: string; currency?: string; returnUrl?: string; cancelUrl?: string }) {
    const currency = body.currency ?? 'PLN';
    const order = await this.paypalService.createOrder(body.amount, currency, body.returnUrl, body.cancelUrl);
    return { id: order.id, result: order };
  }

  @Post('capture-order')
  async captureOrder(@Body() body: { orderID: string; allCarsListId?: number }) {
    if (!body.orderID) throw new BadRequestException('orderID required');

    const capture = await this.paypalService.captureOrder(body.orderID);
    const status = (capture as any).status ?? (capture as any).result?.status ?? null;

    const captures = (capture as any).result?.purchase_units?.flatMap((pu: any) => pu.payments?.captures ?? []) ?? [];
    const anyCompleted = captures.some((c: any) => String(c.status).toUpperCase() === 'COMPLETED');

    if (String(status).toUpperCase() === 'COMPLETED' || anyCompleted) {
      if (body.allCarsListId) {
        await this.carsService.markCarPremium(body.allCarsListId);
      }
    } else {
    }

    return capture;
  }
  @Post('force-capture')
  async forceCapture(@Body() dto: { adId: number }) {
    return await this.carsService.markCarPremium(dto.adId);
  }


}
