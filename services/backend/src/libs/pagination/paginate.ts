import { Repository, FindManyOptions, ObjectLiteral } from 'typeorm';

/**
 * Query parameters for paginated endpoints.
 * Supports page number, limit (capped at 100), and sort direction via prefix ("-" for DESC).
 *
 * @example
 * // { page: 2, limit: 20, sort: '-created_at' } -> page 2, 20 items, newest first
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string; // "created_at" or "-created_at" for DESC
}

/** Paginated response wrapper containing data array and pagination metadata. */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Generic pagination helper for TypeORM repositories. Clamps page >= 1 and 1 <= limit <= 100.
 * Merges sort order from query params with any existing FindManyOptions order.
 *
 * @example
 * const result = await paginate(ticketRepo, { page: 1, limit: 10, sort: '-created_at' }, { where: { projectId } });
 * // result.data = Ticket[], result.meta = { page, limit, total, totalPages }
 */
export async function paginate<T extends ObjectLiteral>(
  repository: Repository<T>,
  query: PaginationQuery,
  options?: FindManyOptions<T>
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const order: Record<string, 'ASC' | 'DESC'> = {};
  if (query.sort) {
    const desc = query.sort.startsWith('-');
    const field = desc ? query.sort.slice(1) : query.sort;
    order[field] = desc ? 'DESC' : 'ASC';
  }

  const [data, total] = await repository.findAndCount({
    ...options,
    skip,
    take: limit,
    order: { ...order, ...(options?.order || {}) } as any
  });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}
