import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export enum ExamType {
  TEST = 'TEST',
  WRITING = 'WRITING',
}

export class CreateExamDto {
  @IsString()
  title: string;

  @IsString()
  universityId: string;

  @IsString()
  subjectId: string;

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

  @IsOptional()
  @IsBoolean()
  random?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;
}
