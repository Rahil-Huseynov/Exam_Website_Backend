import { IsInt, Min } from "class-validator";

export class AddBalanceDto {
  @IsInt()
  @Min(0)
  amount!: number;
}
