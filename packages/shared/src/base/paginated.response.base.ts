export type AggregationResult = Record<string, number>;
export interface PaginationMeta {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  aggregation?: AggregationResult;
}

export class Paginated<T> {
  readonly data: readonly T[];
  readonly pagination: PaginationMeta;

  constructor(props: { 
    data: T[],
    pagination: PaginationMeta,
  }) {
    this.data = props.data;
    this.pagination = props.pagination;
  }
}

export abstract class PaginatedResponseDto<T> extends Paginated<T> {
  abstract readonly data: readonly T[];
}
