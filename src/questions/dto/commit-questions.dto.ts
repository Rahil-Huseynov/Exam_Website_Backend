import { IsArray, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CommitOptionDto {
  @IsString()
  tempOptionId: string;

  @IsString()
  text: string;
}

export class CommitQuestionDto {
  @IsString()
  tempId: string;

  @IsString()
  text: string;

  @IsString()
  correctTempOptionId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitOptionDto)
  options: CommitOptionDto[];
}

export class CommitQuestionsDto {
  @IsString()
  sourcePdfId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitQuestionDto)
  questions: CommitQuestionDto[];
}
