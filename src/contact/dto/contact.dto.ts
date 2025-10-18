import { IsEmail, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class ContactDto {
  @IsNotEmpty()
  @Length(2, 100)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @Length(5, 30)
  phone?: string;

  @IsNotEmpty()
  @Length(2, 150)
  subject: string;

  @IsNotEmpty()
  @Length(5, 2000)
  message: string;
}
