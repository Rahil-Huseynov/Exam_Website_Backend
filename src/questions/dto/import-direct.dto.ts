import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ImportDirectOptionDto {
  @IsString()
  text: string;
}

class ImportDirectQuestionDto {
  @IsString()
  text: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ImportDirectOptionDto)
  options: ImportDirectOptionDto[];

  @IsOptional()
  @IsString()
  correctAnswerText?: string;
}

export class ImportQuestionsDirectDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportDirectQuestionDto)
  questions: ImportDirectQuestionDto[];
}
