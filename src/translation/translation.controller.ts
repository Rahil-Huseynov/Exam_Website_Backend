import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslateDto } from './dto/translate.dto';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Controller('translate')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) { }

  @Post()
  async translate(@Body() body: TranslateDto) {
    const dto = plainToInstance(TranslateDto, body);
    try {
      await validateOrReject(dto);
    } catch (errors) {
      throw new BadRequestException('Invalid payload');
    }

    const { texts, target, mimeType } = dto;
    const targetCode = String(target).split('-')[0];

    const result = await this.translationService.translate(texts, targetCode, mimeType);
    return {
      translations: result.translations,
      detectedLanguages: result.detectedLanguageCodes,
      originals: texts,
      originalLanguages: result.detectedLanguageCodes,
    };
  }
}
