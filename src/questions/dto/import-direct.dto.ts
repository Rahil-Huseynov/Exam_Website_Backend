import { 
  IsArray, 
  IsOptional, 
  IsString, 
  ValidateNested, 
  IsNotEmpty 
} from "class-validator";
import { Type } from "class-transformer";

export class ImportDirectOptionDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class ImportDirectQuestionDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportDirectOptionDto)
  options: ImportDirectOptionDto[];

  @IsOptional()
  @IsString()
  correctAnswerText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class ImportQuestionsDirectDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportDirectQuestionDto)
  questions: ImportDirectQuestionDto[];
}
