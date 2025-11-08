import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

type Subscription = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

type PushResult = {
  endpoint: string;
  status: 'ok' | 'error';
  error?: string;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    const privateKey = process.env.PRIVATE_VAPID_KEY;
    const contact = `mailto:${process.env.EMAIL_FOR_VAPID || 'admin@localhost'}`;

    if (!publicKey || !privateKey) {
      this.logger.error('VAPID keys are missing. Set PUBLIC_VAPID_KEY and PRIVATE_VAPID_KEY in .env');
    } else {
      webpush.setVapidDetails(contact, publicKey, privateKey);
      this.logger.log('VAPID details set successfully.');
    }
  }

  async saveSubscription(subscription: Subscription, userId?: string) {
    if (!subscription || !subscription.endpoint) throw new Error('Invalid subscription object');
    const endpoint = subscription.endpoint;
    const keysJson = JSON.stringify(subscription.keys || {});
    try {
      const result = await this.prisma.pushSubscription.upsert({
        where: { endpoint },
        update: { keysJson, userId },
        create: { endpoint, keysJson, userId },
      });
      this.logger.log(`Saved subscription: ${endpoint}`);
      return result;
    } catch (err) {
      this.logger.error('Failed to save subscription: ' + (err as Error).message);
      throw err;
    }
  }

  async sendPushToAll(payload: Record<string, any>): Promise<PushResult[]> {
    const subs = await this.prisma.pushSubscription.findMany();
    this.logger.log(`Sending push to ${subs.length} subscriptions.`);
    const results: PushResult[] = [];

    for (const s of subs) {
      const subscription: Subscription = { endpoint: s.endpoint, keys: JSON.parse(s.keysJson) };
      try {
        await webpush.sendNotification(subscription as any, JSON.stringify(payload));
        results.push({ endpoint: s.endpoint, status: 'ok' });
      } catch (err: any) {
        results.push({ endpoint: s.endpoint, status: 'error', error: err?.message || String(err) });
        this.logger.warn(`Failed to send to ${s.endpoint} — statusCode: ${err?.statusCode || 'unknown'}`);

        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await this.prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } });
            this.logger.log(`Deleted stale subscription ${s.endpoint}`);
          } catch (deleteErr) {
            this.logger.error(`Failed to delete stale subscription ${s.endpoint}: ${(deleteErr as Error).message}`);
          }
        }
      }
    }

    return results;
  }

  async sendPushToSubscription(subscription: Subscription, payload: Record<string, any>): Promise<PushResult> {
    try {
      await webpush.sendNotification(subscription as any, JSON.stringify(payload));
      return { endpoint: subscription.endpoint, status: 'ok' };
    } catch (err: any) {
      return { endpoint: subscription.endpoint, status: 'error', error: err?.message || String(err) };
    }
  }
  async sendPushToAnonymous(payload: Record<string, any>): Promise<PushResult[]> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: null }, 
    });
    this.logger.log(`Sending push to ${subs.length} anonymous subscriptions.`);
    const results: PushResult[] = [];

    for (const s of subs) {
      const subscription: Subscription = { endpoint: s.endpoint, keys: JSON.parse(s.keysJson) };
      try {
        await webpush.sendNotification(subscription as any, JSON.stringify(payload));
        results.push({ endpoint: s.endpoint, status: 'ok' });
      } catch (err: any) {
        results.push({ endpoint: s.endpoint, status: 'error', error: err?.message || String(err) });
        this.logger.warn(`Failed to send to ${s.endpoint} — statusCode: ${err?.statusCode || 'unknown'}`);

        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await this.prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } });
            this.logger.log(`Deleted stale subscription ${s.endpoint}`);
          } catch (deleteErr) {
            this.logger.error(`Failed to delete stale subscription ${s.endpoint}: ${(deleteErr as Error).message}`);
          }
        }
      }
    }

    return results;
  }
}
