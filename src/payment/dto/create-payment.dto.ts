import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  amount: number;

  @IsString()
  order_id: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  userId?: number;
}
