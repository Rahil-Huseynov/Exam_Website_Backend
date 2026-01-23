import { Transform } from "class-transformer"
import { IsBoolean } from "class-validator"

export class SetFlagDto {
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  flag?: boolean
}
