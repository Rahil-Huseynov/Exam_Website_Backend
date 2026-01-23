import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogArchiveService } from './log-archive.service';

@Controller('logs')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class LogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archiveService: LogArchiveService,
  ) {}

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

    return {
      page: Number(page),
      limit: Number(limit),
      total,
      data,
    };
  }

  @Post('archive')
  async archiveNow() {
    const result = await this.archiveService.archiveLogs();
    return {
      success: true,
      ...result,
    };
  }
}
