// src/translation/dto/translate.dto.ts
import { IsArray, ArrayNotEmpty, IsString, IsOptional } from 'class-validator';

export class TranslateDto {
  @IsArray()
  @ArrayNotEmpty()
  texts!: string[];

  @IsString()
  target!: string; // e.g. "az", "en", "tr"

  @IsOptional()
  @IsString()
  mimeType?: 'text/plain' | 'text/html' | string;
}
