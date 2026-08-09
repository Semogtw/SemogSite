import type { JsonValue } from "@semogtw/domain";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { SemogtwD1Database } from "../adapters/d1";
import { auditEvents } from "../schema/audit";
import type {
  AuditJsonField,
  AuditListInput,
  AuditPage,
} from "./audit-data-source";

function parseAuditJson(
  value: string | null,
  field: AuditJsonField,
  malformed: AuditJsonField[],
): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    malformed.push(field);
    return null;
  }
}

export class D1AuditDataSource {
  constructor(private readonly database: SemogtwD1Database) {}

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
    const total = (await countQuery.get())?.value ?? 0;

    let pageQuery = this.database.select().from(auditEvents).$dynamic();
    if (where) pageQuery = pageQuery.where(where);
    const rows = await pageQuery
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
