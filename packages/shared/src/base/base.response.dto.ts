import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

class IdResponse {
  @IsString()
  @IsUUID()
  readonly id: string;
}

export class BaseResponseDto extends IdResponse {
  @IsDateString()
  @Transform(({ value }) =>
    value instanceof Date ? value.toISOString() : value
  )
  @IsOptional()
  readonly createdAt: string | Date;

  @IsDateString()
  @Transform(({ value }) =>
    value instanceof Date ? value.toISOString() : value
  )
  @IsOptional()
  readonly updatedAt: string | Date;
}
