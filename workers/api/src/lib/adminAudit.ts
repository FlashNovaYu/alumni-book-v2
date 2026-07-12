export type AuditInput = {
  action: string
  resourceType: string
  resourceId: string
  reason?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

function serializeSummary(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

export function buildAuditStatement(db: D1Database, adminId: string, input: AuditInput): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO admin_audit_logs
      (id, admin_account_id, action, resource_type, resource_id, reason, before_summary, after_summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    `audit_${crypto.randomUUID()}`,
    adminId,
    input.action,
    input.resourceType,
    input.resourceId,
    input.reason || null,
    serializeSummary(input.before),
    serializeSummary(input.after),
    JSON.stringify(input.metadata || {}),
  )
}

export async function runAuditedBatch(
  db: D1Database,
  adminId: string,
  mutations: D1PreparedStatement[],
  audit: AuditInput,
): Promise<void> {
  await db.batch([...mutations, buildAuditStatement(db, adminId, audit)])
}
