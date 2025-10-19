import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/auth/guard';

@Controller('admin/stats')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) { }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get()
  async getStats() {
    return this.statsService.getOverview();
  }
}
