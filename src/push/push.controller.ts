import { Body, Controller, Post, Logger } from '@nestjs/common';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  private readonly logger = new Logger(PushController.name);

  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  async subscribe(@Body() body: { subscription: any; userId?: string }) {
    if (!body?.subscription || !body.subscription.endpoint) {
      this.logger.warn('subscribe called without valid subscription body');
      return { ok: false, message: 'Subscription object is required in request body' };
    }
    await this.pushService.saveSubscription(body.subscription, body.userId);
    return { ok: true, message: 'Subscription saved' };
  }

  @Post('notify-all')
  async notifyAll(
    @Body() body: { title: string; body: string; url?: string; icon?: string }
  ) {
    const payload = {
      title: body.title || 'Notification',
      body: body.body || '',
      url: body.url || '/',
      icon: body.icon || '/icons/car-192.png',
    };
    const results = await this.pushService.sendPushToAll(payload);
    return { ok: true, results };
  }

  @Post('new-car')
  async notifyNewCar(@Body() body: { id: string | number; make: string; model: string; year?: number; url?: string }) {
    if (!body?.id || !body?.make || !body?.model) {
      return { ok: false, message: 'id, make and model are required' };
    }
    const payload = {
      title: 'New car added 🚗',
      body: `${body.make} ${body.model}${body.year ? ' — ' + body.year : ''}`,
      url: body.url || `/cars/${body.id}`,
      icon: '/icons/car-192.png',
    };
    const results = await this.pushService.sendPushToAll(payload);
    return { ok: true, results };
  }
}
