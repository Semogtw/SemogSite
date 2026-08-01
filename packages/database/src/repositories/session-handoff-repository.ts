import type {
  RecordedDevelopmentSession,
  SessionHandoffAuditEvent,
  SessionHandoffRepository,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";
import { developmentSessions } from "../schema/operations";

export class SqliteSessionHandoffRepository
  implements SessionHandoffRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async insertSessionWithAudit(
    session: RecordedDevelopmentSession,
    audit: SessionHandoffAuditEvent,
  ): Promise<void> {
    this.database.transaction((transaction) => {
      transaction
        .insert(developmentSessions)
        .values({
          id: session.id,
          projectId: session.projectId,
          title: session.title,
          sessionDate: session.sessionDate,
          actor: session.actor,
          branch: session.branch,
          commitsJson: JSON.stringify(session.commits),
          completedSummary: session.completedSummary,
          testsStatus: session.testsStatus,
          testsSummary: session.testsSummary,
          blockers: session.blockers,
          nextStep: session.nextStep,
          result: session.result,
          sourceUrl: session.sourceUrl,
          automatic: session.automatic,
          sourceHash: session.sourceHash,
          dataSource: session.source,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        })
        .run();
      transaction
        .insert(auditEvents)
        .values({
          id: audit.id,
          actor: audit.actor,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
          beforeJson: null,
          afterJson: JSON.stringify(audit.after),
          reason: audit.reason,
          occurredAt: audit.occurredAt,
          source: audit.source,
          confirmed: audit.confirmed,
          correlationId: audit.correlationId,
        })
        .run();
    });
  }
}
