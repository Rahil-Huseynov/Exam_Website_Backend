import { Injectable, Logger } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';

@Injectable()
export class PaypalService {
  private client: paypal.core.PayPalHttpClient;
  private readonly logger = new Logger(PaypalService.name);

  constructor() {
    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
    const isLive = process.env.PAYPAL_MODE === 'SANDBOX';

    const environment = isLive
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createOrder(amount: string, currency = 'PLN', customId?: string) {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');

    const purchaseUnit: any = {
      amount: { currency_code: currency, value: amount },
    };
    if (customId) purchaseUnit.custom_id = String(customId);

    const returnUrl = process.env.PAYPAL_RETURN_URL!;
    const cancelUrl = process.env.PAYPAL_CANCEL_URL!;

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: {
        brand_name: 'CarSales',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    });

    const response = await this.client.execute(request);
    return response.result;
  }

  async captureOrder(orderId: string) {
    if (!orderId) throw new Error('orderId required for capture');
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const response = await this.client.execute(request);
    return response.result;
  }
}
