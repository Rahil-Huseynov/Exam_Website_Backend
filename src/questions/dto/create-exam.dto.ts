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

  @IsInt()
  year: number;

  @IsNumber()
  @Min(0)
  price: number;
}
