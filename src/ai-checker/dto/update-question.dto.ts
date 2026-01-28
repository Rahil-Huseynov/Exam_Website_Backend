import { IsInt, IsString } from 'class-validator';

export class SubmitAnswerDto {
  @IsInt()
  userId: number;

  @IsString()
  aiQuestionId: string;

  @IsString()
  studentAnswer: string;
}
