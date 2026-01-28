import { IsBoolean, IsOptional, IsString } from "class-validator";

export class AnswerDto {
  @IsString()
  questionId: string;

  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  studentTextAnswer?: string;

  @IsOptional()
  @IsBoolean()
  flag?: boolean;
}
