import { Transform } from "class-transformer"
import { IsIn, IsInt, IsOptional, Min } from "class-validator"

export class NewsQueryDto {
  @IsOptional()
  @IsIn(["az", "en", "ru"])
  lang?: "az" | "en" | "ru"

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  limit?: number = 20
}
