import { IsString } from "class-validator";

export class AnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  selectedOptionId: string;
}
