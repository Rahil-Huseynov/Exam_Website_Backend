import { IsOptional, IsString } from 'class-validator';

export class CreateAiQuestionDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  answerKey?: string;

  @IsOptional()
  adminId?: number;
}
