import { IsArray, IsEmail, IsOptional, IsString, ArrayNotEmpty, IsNotEmpty, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class EmailButton {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  link: string;
}

export class EmailContext {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailButton)
  button?: EmailButton;
}

export class SendEmailDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  message?: string;

  @ValidateNested()
  @Type(() => EmailContext)
  context: EmailContext;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  recipients: string[];
}
