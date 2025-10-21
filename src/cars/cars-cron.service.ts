import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CarsService } from './cars.service';

@Injectable()
export class CarsCronService {
  private readonly logger = new Logger(CarsCronService.name);
  constructor(private readonly carsService: CarsService) {}

  @Cron('0 * * * * *')
  async handlePremiumExpiry() {
    this.logger.log('Running premium expiry job (every 1 minute)');
    try {
      const res = await this.carsService.expirePremiums();
      if ((res as any).expiredAllCount || (res as any).expiredUserOnlyCount) {
        this.logger.log(`Expired: ${JSON.stringify(res)}`);
      }
    } catch (err) {
      this.logger.error('Error expiring premiums', err as any);
    }
  }
}
