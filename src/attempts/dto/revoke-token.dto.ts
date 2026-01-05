import { IsString } from "class-validator";
import { CreateAttemptDto } from "./create-attempt.dto";

export class RevokeTokenDto extends CreateAttemptDto {
  @IsString()
  token: string;
}
