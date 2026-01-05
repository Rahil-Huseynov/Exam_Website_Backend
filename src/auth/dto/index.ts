export * from './login.auth.dto'
export * from './register.auth.dto'
export * from './register.admin.auth.dto'
export * from './update-user.dto'
export * from './update-password.dto'
export * from './reset-password.dto'
export * from './forgot-password.dto'
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
export class RegisterAuthDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  phoneCode?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class LoginAuthDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @Length(8)
  newPassword: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  phoneCode?: string;
}
