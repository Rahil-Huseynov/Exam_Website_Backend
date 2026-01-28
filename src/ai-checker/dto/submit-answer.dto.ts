import { IsOptional, IsString } from 'class-validator';

export class UpdateAiQuestionDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  answerKey?: string;
}
