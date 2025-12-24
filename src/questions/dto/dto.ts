import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class CommitOptionDto {
  @IsString() @IsNotEmpty() tempOptionId!: string;
  @IsString() @IsNotEmpty() text!: string;
}

class CommitQuestionDto {
  @IsString() @IsNotEmpty() tempId!: string;
  @IsString() @IsNotEmpty() text!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitOptionDto)
  options!: CommitOptionDto[];

  @IsString() @IsNotEmpty() correctTempOptionId!: string;
}

export class CommitQuestionsDto {
  @IsOptional() @IsString() sourcePdfId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitQuestionDto)
  questions!: CommitQuestionDto[];
}

export class CreateAttemptDto {
  @IsInt()
  userId!: number;
}

export class AnswerDto {
  @IsString() @IsNotEmpty() questionId!: string;
  @IsString() @IsNotEmpty() selectedOptionId!: string;
}
