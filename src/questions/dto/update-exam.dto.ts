import { IsOptional, IsInt, Min, IsNumber, IsString, IsBoolean } from "class-validator"
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

    @IsOptional()
    @IsBoolean()
    random?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    durationMinutes?: number

}