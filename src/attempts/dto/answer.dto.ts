import { IsBoolean, IsString, IsOptional } from "class-validator";

export class AnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  selectedOptionId: string;

  @IsOptional()
  @IsBoolean()
  flag?: boolean;
}
