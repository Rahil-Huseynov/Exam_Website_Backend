import { IsString } from "class-validator";
import { CreateAttemptDto } from "./create-attempt.dto";

export class CreateAttemptWithTokenDto extends CreateAttemptDto {
  @IsString()
  token: string;
}
