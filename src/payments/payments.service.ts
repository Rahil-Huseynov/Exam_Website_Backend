import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private publicKey: string;
  private privateKey: string;
  private successUrl: string;
  private errorUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private http: HttpService,
  ) {
    this.publicKey = (this.configService.get<string>('EPOINT_PUBLIC_KEY') || '').trim();
    this.privateKey = (this.configService.get<string>('EPOINT_PRIVATE_KEY') || '').trim();
    this.successUrl = (this.configService.get<string>('EPOINT_SUCCESS_URL') || '').trim();
    this.errorUrl = (this.configService.get<string>('EPOINT_ERROR_URL') || '').trim();

    if (!this.publicKey || !this.privateKey || !this.successUrl || !this.errorUrl) {
      throw new Error('EPOINT açarları .env-də yoxdur/boşdur: EPOINT_PUBLIC_KEY, EPOINT_PRIVATE_KEY, EPOINT_SUCCESS_URL, EPOINT_ERROR_URL');
    }
  }

  async generatePaymentData(userId: number, amount: number, orderId: string, description: string) {
    const params = {
      public_key: this.publicKey,
      amount: amount.toFixed(2),
      currency: 'AZN',
      language: 'az',
      order_id: orderId, 
      description,
      success_redirect_url: this.successUrl,
      error_redirect_url: this.errorUrl,
      other_attr: [], 
    };

    console.log('Epoint Params:', params);
    const jsonString = JSON.stringify(params);
    console.log('JSON String:', jsonString);
    const data = Buffer.from(jsonString).toString('base64');
    console.log('Base64 Data:', data);

    const sgn_string = this.privateKey + data + this.privateKey;
    const hash = crypto.createHash('sha1').update(sgn_string).digest();
    const signature = hash.toString('base64');
    console.log('Signature:', signature);

    const formData = new URLSearchParams();
    formData.append('data', data);
    formData.append('signature', signature);

    const response = await firstValueFrom(
      this.http.post('https://epoint.az/api/1/request', formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    const resData = response.data;

    if (resData.status !== 'success') {
      throw new BadRequestException(`Epoint error: ${resData.code} - ${resData.message}`);
    }

    return { redirect_url: resData.redirect_url };
  }

  async handleCallback(callbackData: { data: string; signature?: string }) {
    const computedSignature = crypto
      .createHash('sha1')
      .update(this.privateKey + callbackData.data + this.privateKey)
      .digest()
      .toString('base64');

    if (computedSignature !== callbackData.signature) {
      throw new BadRequestException('Invalid signature');
    }

    let decodedJson: any;
    try {
      decodedJson = JSON.parse(Buffer.from(callbackData.data, 'base64').toString('utf-8'));
      console.log('Callback Decoded:', decodedJson);
    } catch (error) {
      throw new BadRequestException('Invalid data format');
    }

    const paymentResponse = await this.prisma.paymentResponse.create({
      data: {
        orderId: decodedJson.order_id,
        transactionId: decodedJson.transaction,
        operationCode: decodedJson.operation_code,
        status: decodedJson.status,
        rrn: decodedJson.rrn,
        payload: decodedJson,
        signature: callbackData.signature || null,
      },
    });

    if (decodedJson.status === 'success') {
      const existingTx = await this.prisma.balanceTransaction.findFirst({
        where: { note: { contains: decodedJson.transaction } },
      });
      if (existingTx) {
        return { message: 'Ödəniş artıq işlənib (duplicate)' };
      }

      const orderIdParts = decodedJson.order_id.split('_');
      if (orderIdParts[0] !== 'balance' || !orderIdParts[1]) {
        throw new BadRequestException('Invalid order_id format – userId tapılmadı');
      }
      const userId = Number(orderIdParts[1]);
      if (isNaN(userId)) {
        throw new BadRequestException('Invalid userId in order_id');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException('İstifadəçi tapılmadı');

      const amountDecimal = new Prisma.Decimal(decodedJson.amount);
      const newBalance = user.balance.add(amountDecimal);

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { balance: newBalance },
        });

        await tx.balanceTransaction.create({
          data: {
            userId: user.id,
            amount: amountDecimal,
            type: 'ADMIN_TOPUP', 
            note: `Epoint ödənişi: ${decodedJson.transaction}`,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
          },
        });
      });

      await this.prisma.paymentResponse.update({
        where: { id: paymentResponse.id },
        data: { userId: user.id },
      });

      return { message: 'Balans uğurla artırıldı' };
    }

    return { message: 'Ödəniş uğursuz oldu' };
  }

  async getPaymentStatus(transaction: string) {
    const params = {
      public_key: this.publicKey,
      transaction,
    };

    const jsonString = JSON.stringify(params);
    const data = Buffer.from(jsonString).toString('base64');
    const sgn_string = this.privateKey + data + this.privateKey;
    const hash = crypto.createHash('sha1').update(sgn_string).digest();
    const signature = hash.toString('base64');

    const formData = new URLSearchParams();
    formData.append('data', data);
    formData.append('signature', signature);

    const response = await firstValueFrom(
      this.http.post('https://epoint.az/api/1/get-status', formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    return response.data;
  }
}