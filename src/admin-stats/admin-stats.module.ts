import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AdminStatsController],
  providers: [AdminStatsService, PrismaService],
})
export class AdminStatsModule {}
