import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureService {
  constructor(private prisma: PrismaService) {}

  async getFeature(key: string) {
    const ft = await this.prisma.featureToggle.findUnique({ where: { key } });
    return ft ?? null;
  }

  async isEnabled(key: string) {
    const ft = await this.getFeature(key);
    return ft ? ft.enabled : false;
  }

  async setEnabled(key: string, enabled: boolean) {
    const ft = await this.prisma.featureToggle.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled },
    });
    return ft;
  }
}
