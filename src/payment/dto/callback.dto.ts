import { IsString } from 'class-validator';

export class CallbackDto {
  @IsString()
  data: string;

  @IsString()
  signature: string;
}
