import { IsOptional, IsInt, Min, IsNumber, IsString } from "class-validator"
import { Type } from "class-transformer"

export class UpdateExamDto {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    year?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    price?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    questionCount?: number
}