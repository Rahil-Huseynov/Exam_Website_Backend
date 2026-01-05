import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/guard';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('logs')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class LogsController {
  constructor(private readonly prisma: PrismaService) { }
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get()
  async getLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.log.count(),
    ]);

    return { data, total };
  }
}
