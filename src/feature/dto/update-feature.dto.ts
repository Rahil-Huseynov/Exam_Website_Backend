import { IsBoolean, IsString } from "class-validator";

export class UpdateFeatureDto {
  @IsString()
  key: string;

  @IsBoolean()
  enabled: boolean;
}
