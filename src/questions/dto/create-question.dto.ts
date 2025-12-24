import { IsArray, IsOptional, IsString, ValidateNested, ArrayMinSize } from "class-validator";
import { Type } from "class-transformer";

class CreateQuestionOptionDto {
  @IsString()
  text: string;
}

export class CreateQuestionDto {
  @IsString()
  text: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options: CreateQuestionOptionDto[];

  @IsOptional()
  @IsString()
  correctAnswerText?: string;
}
