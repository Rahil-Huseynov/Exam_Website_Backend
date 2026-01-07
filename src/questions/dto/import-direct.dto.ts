import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator"
import { Type } from "class-transformer"

export class ImportDirectOptionDto {
  @IsString()
  text: string
}

export class ImportDirectQuestionDto {
  @IsString()
  text: string

  @ValidateNested({ each: true })
  @Type(() => ImportDirectOptionDto)
  options: ImportDirectOptionDto[]

  @IsOptional()
  @IsString()
  correctAnswerText?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[]
}

export class ImportQuestionsDirectDto {
  @ValidateNested({ each: true })
  @Type(() => ImportDirectQuestionDto)
  questions: ImportDirectQuestionDto[]
}
