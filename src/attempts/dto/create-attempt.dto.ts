import { IsInt, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class CreateAttemptDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}
