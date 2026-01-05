import { IsArray, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class DraftOptionDto {
  @IsString()
  tempOptionId: string;

  @IsString()
  text: string;
}

export class DraftQuestionDto {
  @IsString()
  tempId: string;

  @IsString()
  text: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftOptionDto)
  options: DraftOptionDto[];

  @IsString()
  correctTempOptionId: string;
}

export class CommitQuestionsDirectDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftQuestionDto)
  questions: DraftQuestionDto[];
}
