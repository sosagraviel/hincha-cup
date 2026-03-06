import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class AggregationRule {
  @IsString()
  columnAlias: string;

  @IsString()
  condition: string;
}

export class AggregationRequestDto {
  @IsString()
  @IsOptional()
  column?: string;

  @IsArray()
  @Type(() => AggregationRule)
  @IsOptional()
  rules?: AggregationRule[];
} 