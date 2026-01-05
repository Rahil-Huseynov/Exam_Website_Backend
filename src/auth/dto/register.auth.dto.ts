import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsBoolean,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";

export class RegisterAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  role?: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  phoneCode?: string;
}
