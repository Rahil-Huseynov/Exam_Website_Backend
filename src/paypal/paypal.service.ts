import { Injectable, Logger } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';

@Injectable()
export class PaypalService {
  private client: paypal.core.PayPalHttpClient;

  constructor() {
    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
    const isSandbox = process.env.PAYPAL_MODE === 'SANDBOX';

    const environment = isSandbox
      ? new paypal.core.SandboxEnvironment(clientId, clientSecret)
      : new paypal.core.LiveEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
    Logger.log(`PayPal mode: ${isSandbox ? 'Sandbox' : 'Live'}`);
    if (!clientId || !clientSecret) {
      throw new Error('Missing PayPal env vars');
    }
    if (!process.env.PAYPAL_RETURN_URL || !process.env.PAYPAL_CANCEL_URL) {
      throw new Error('Missing PayPal return/cancel URLs');
    }
  }
  async createOrder(amount: string, currency = 'PLN', customId?: string) {
    if (!this.client) throw new Error('PayPal client is not initialized');

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');

    const purchaseUnit: any = { amount: { currency_code: currency, value: amount } };
    if (customId) purchaseUnit.custom_id = String(customId);

    const returnUrl = process.env.PAYPAL_RETURN_URL!;
    const cancelUrl = process.env.PAYPAL_CANCEL_URL!;

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: {
        brand_name: 'Carvia',
        landing_page: 'NO_PREFERENCE',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    });

    const response = await this.client.execute(request);
    const result = response.result;

    const link = (result?.links ?? []).find((l: any) => l.rel === 'approve')?.href ?? null;

    return {
      id: result?.id ?? null,
      approveLink: link,
      rawResult: result,
    };
  }

  async captureOrder(orderId: string) {
    if (!this.client) throw new Error('PayPal client is not initialized');
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const response = await this.client.execute(request);
    return response.result;
  }
}
