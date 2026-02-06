import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentService {
  private publicKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.publicKey = (this.configService.get<string>('EPOINT_PUBLIC_KEY') || '').trim();

    if (!this.publicKey) {
      throw new Error('EPOINT_PUBLIC_KEY .env-də yoxdur/boşdur');
    }
  }

  generatePaymentData(userId: number, amount: number, orderId: string, description: string) {
    const params = {
      public_key: this.publicKey,
      amount: amount.toFixed(2),
      currency: 'AZN',
      language: 'az',
      order_id: orderId,
      description,
    };

    console.log('Epoint Params:', params);

    const jsonString = JSON.stringify(params);
    console.log('JSON String:', jsonString);

    const data = Buffer.from(jsonString, 'utf-8').toString('base64');
    console.log('Generated Base64 Data:', data);

    return { data };
  }

  async handleCallback(callbackData: { data: string }) {
    let decodedJson: any;
    try {
      decodedJson = JSON.parse(Buffer.from(callbackData.data, 'base64').toString('utf-8'));
      console.log('Callback Decoded:', decodedJson);
    } catch (error) {
      throw new BadRequestException('Invalid data format');
    }

    await this.prisma.paymentResponse.create({
      data: {
        orderId: decodedJson.order_id,
        transactionId: decodedJson.transaction ?? null,
        operationCode: decodedJson.operation_code ?? null,
        status: decodedJson.status,
        rrn: decodedJson.rrn ?? null,
        payload: decodedJson,
        signature: null,
      },
    });

    if (decodedJson.status === 'success') {
      const existingTx = await this.prisma.balanceTransaction.findFirst({
        where: { note: { contains: decodedJson.transaction ?? decodedJson.order_id } },
      });

      if (existingTx) {
        return { message: 'Ödəniş artıq işlənib (duplicate)' };
      }

      const orderIdParts = decodedJson.order_id.split('_');
      if (orderIdParts[0] !== 'balance' || orderIdParts.length < 2) {
        throw new BadRequestException('Invalid order_id format – userId tapılmadı');
      }

      const userId = Number(orderIdParts[1]);
      if (isNaN(userId)) {
        throw new BadRequestException('Invalid userId in order_id');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new BadRequestException('İstifadəçi tapılmadı');
      }

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
            currency: 'AZN',
            type: 'ADMIN_TOPUP',
            note: `Epoint ödənişi: ${decodedJson.transaction ?? decodedJson.order_id}`,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
          },
        });
      });

      return { message: 'Balans uğurla artırıldı' };
    }

    return { message: 'Ödəniş uğursuz oldu' };
  }
}