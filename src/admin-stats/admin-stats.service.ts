import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class AdminStatsService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsers,
      totalExams,
      totalAttempts,
      totalRevenueResult,
    ] = await Promise.all([
      this.prisma.user.count(),

      this.prisma.questionBank.count(),

      this.prisma.attempt.count(),

      this.prisma.payment.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          status: PaymentStatus.SUCCESS,
        },
      }),
    ]);

    return {
      totalUsers,
      totalExams,
      totalAttempts,
      totalRevenue: totalRevenueResult._sum.amount || 0,
    };
  }
}
