import { IsBoolean, IsOptional, IsString } from "class-validator"

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  titleAz?: string

  @IsOptional()
  @IsString()
  titleEn?: string | null

  @IsOptional()
  @IsString()
  titleRu?: string | null

  @IsOptional()
  @IsString()
  contentAz?: string

  @IsOptional()
  @IsString()
  contentEn?: string | null

  @IsOptional()
  @IsString()
  contentRu?: string | null

  @IsOptional()
  @IsString()
  imageUrl?: string | null

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean
}
