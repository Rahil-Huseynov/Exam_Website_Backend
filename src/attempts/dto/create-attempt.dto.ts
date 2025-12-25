import { IsInt, Min } from "class-validator";

export class CreateAttemptDto {
  @IsInt()
  @Min(1)
  userId: number;
}
