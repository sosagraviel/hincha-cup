export interface AuditRecord {
  recordId: string;
  event: string;
  userId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditRequest {
  event: string;
  userId: string;
  payload?: Record<string, unknown>;
}
