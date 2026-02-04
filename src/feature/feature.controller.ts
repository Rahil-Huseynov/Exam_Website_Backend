import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { UpdateFeatureDto } from './dto/update-feature.dto';

@Controller('feature')
export class FeatureController {
  constructor(private readonly featureService: FeatureService) { }

  @Get()
  async getAll() {
    return this.featureService['prisma'].featureToggle.findMany();
  }

  @Get(':key')
  async getOne(@Param('key') key: string) {
    const ft = await this.featureService.getFeature(key);
    return { key, enabled: !!ft?.enabled };
  }

  @Post()
  async update(@Body() dto: UpdateFeatureDto) {
    const ft = await this.featureService.setEnabled(dto.key, dto.enabled);
    return { key: ft.key, enabled: ft.enabled };
  }

}
