import { Injectable } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';

@Injectable()
export class PaypalService {
  private client: paypal.core.PayPalHttpClient;

  constructor() {
    const clientId = process.env.PAYPAL_CLIENT_ID || 'YOUR_CLIENT_ID';
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
    const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createOrder(amount: string, currency: string = 'PLN', returnUrl?: string, cancelUrl?: string) {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');

    const appContext: any = {};
    if (returnUrl) appContext.return_url = returnUrl;
    if (cancelUrl) appContext.cancel_url = cancelUrl;

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        { amount: { currency_code: currency, value: amount } },
      ],
      application_context: Object.keys(appContext).length ? appContext : undefined,
    });

    const response = await this.client.execute(request);
    return response.result;
  }
  
  async captureOrder(orderId: string) {
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const response = await this.client.execute(request);
    return response.result;
  }
}
