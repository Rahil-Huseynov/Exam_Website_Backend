import { IsNumber, IsString, Min } from "class-validator"

export class AdminTopUpByPublicIdDto {
  @IsString()
  publicId: string

  @IsNumber()
  @Min(0.01)
  amount: number
}
