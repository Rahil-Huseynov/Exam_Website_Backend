import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator"

export class ContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string

  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string
}
