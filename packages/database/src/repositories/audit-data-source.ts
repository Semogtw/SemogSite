import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";

export type AuditJsonField = "before" | "after";

export type AuditRecord = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown | null;
  after: unknown | null;
  reason: string;
  occurredAt: string;
  source: "manual" | "github" | "mcp" | "migration" | "seed_demo";
  confirmed: boolean;
  correlationId: string;
  malformedJson: readonly AuditJsonField[];
};

export type AuditListInput = {
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
};

export type AuditPage = {
  items: readonly AuditRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function parseAuditJson(
  value: string | null,
  field: AuditJsonField,
  malformed: AuditJsonField[],
): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    malformed.push(field);
    return null;
  }
}

export class SqliteAuditDataSource {
  constructor(private readonly database: SqliteDatabase) {}

  async list(input: AuditListInput): Promise<AuditPage> {
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
    const conditions: SQL[] = [];
    const action = input.action?.trim();
    const entityType = input.entityType?.trim();
    if (action) conditions.push(eq(auditEvents.action, action));
    if (entityType) conditions.push(eq(auditEvents.entityType, entityType));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let countQuery = this.database
      .select({ value: count() })
      .from(auditEvents)
      .$dynamic();
    if (where) countQuery = countQuery.where(where);
    const total = countQuery.get()?.value ?? 0;

    let pageQuery = this.database
      .select()
      .from(auditEvents)
      .$dynamic();
    if (where) pageQuery = pageQuery.where(where);
    const rows = pageQuery
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    return {
      items: rows.map((row) => {
        const malformedJson: AuditJsonField[] = [];
        return {
          id: row.id,
          actor: row.actor,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          before: parseAuditJson(row.beforeJson, "before", malformedJson),
          after: parseAuditJson(row.afterJson, "after", malformedJson),
          reason: row.reason,
          occurredAt: row.occurredAt,
          source: row.source,
          confirmed: row.confirmed,
          correlationId: row.correlationId,
          malformedJson,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }
}
