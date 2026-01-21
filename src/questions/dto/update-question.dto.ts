import { IsArray, IsOptional, IsString, ValidateNested, ArrayMinSize, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class QuestionOptionForUpdateDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'Ən azı 2 variant olmalıdır' })
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionForUpdateDto)
  options?: QuestionOptionForUpdateDto[];

  @IsOptional()
  @IsString()
  correctAnswerText?: string;
}