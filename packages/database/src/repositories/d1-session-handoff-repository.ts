import type {
  RecordedDevelopmentSession,
  SessionHandoffAuditEvent,
  SessionHandoffRepository,
} from "@semogtw/domain";
import type { D1DatabaseBinding } from "../adapters/d1";

export class D1SessionHandoffRepository implements SessionHandoffRepository {
  constructor(private readonly database: D1DatabaseBinding) {}

  async insertSessionWithAudit(
    session: RecordedDevelopmentSession,
    audit: SessionHandoffAuditEvent,
  ): Promise<void> {
    const sessionInsert = this.database
      .prepare(
        `INSERT INTO development_sessions (
          id, project_id, title, session_date, actor, branch, commits_json,
          completed_summary, tests_status, tests_summary, blockers, next_step,
          result, source_url, automatic, source_hash, data_source, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.id,
        session.projectId,
        session.title,
        session.sessionDate,
        session.actor,
        session.branch,
        JSON.stringify(session.commits),
        session.completedSummary,
        session.testsStatus,
        session.testsSummary,
        session.blockers,
        session.nextStep,
        session.result,
        session.sourceUrl,
        session.automatic ? 1 : 0,
        session.sourceHash,
        session.source,
        session.createdAt,
        session.updatedAt,
      );

    const auditInsert = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        null,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([sessionInsert, auditInsert]);
    if (
      results.some(
        (result) =>
          result.success === false || (result.error?.length ?? 0) > 0,
      )
    ) {
      throw new Error("D1 session handoff batch failed.");
    }
  }
}
