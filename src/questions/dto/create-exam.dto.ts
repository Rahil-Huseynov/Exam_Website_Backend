import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateExamDto {
  @IsString()
  title: string;

  @IsString()
  universityId: string;

  @IsString()
  subjectId: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @Type(() => Number)
  @IsInt()
  year: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionCount?: number;
}