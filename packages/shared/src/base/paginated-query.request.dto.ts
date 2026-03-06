import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum FilterOperator {
  EQ = 'eq', // Equal
  NEQ = 'neq', // Not Equal
  GT = 'gt', // Greater Than
  GTE = 'gte', // Greater Than or Equal
  LT = 'lt', // Less Than
  LTE = 'lte', // Less Than or Equal
  LIKE = 'like', // Like (contains)
  ILIKE = 'ilike', // Case-insensitive Like
  IN = 'in', // In array
  BETWEEN = 'between', // Between two values
}

export class FilterCondition {
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  value: any;

  @IsOptional()
  path?: string;
}

export class FilterItem extends FilterCondition {
  field: string;
}

export class PaginatedQueryRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99999)
  @Type(() => Number)
  readonly page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  readonly limit: number = 10;

  @IsOptional()
  readonly aggregationBy?: string;

  @IsOptional()
  readonly order?: string | string[];

  @IsOptional()
  readonly sort?: 'ASC' | 'DESC' | Array<'ASC' | 'DESC'> = 'ASC';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get take(): number {
    return this.limit;
  }
}
