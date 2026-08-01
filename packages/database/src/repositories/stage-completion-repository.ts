import type {
  StageCompletionAuditEvent,
  StageCompletionRepository,
  StageSnapshot,
} from "@semogtw/domain";
import { and, eq } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";
import { evidence } from "../schema/operations";
import { stages } from "../schema/roadmap";

export class SqliteStageCompletionRepository
  implements StageCompletionRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findById(id: string): Promise<StageSnapshot | null> {
    const row = this.database
      .select()
      .from(stages)
      .where(eq(stages.id, id))
      .get();
    if (row === undefined) return null;

    const evidenceRows = this.database
      .select({ id: evidence.id, status: evidence.status })
      .from(evidence)
      .where(eq(evidence.stageId, id))
      .all();

    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      state: row.state,
      progress: row.progress,
      done: row.done,
      nextStep: row.nextStep,
      blocker: row.blocker,
      evidence: evidenceRows,
      manualLock: row.manualLock,
      updatedAt: row.updatedAt,
    };
  }

  async completeWithAudit(
    before: StageSnapshot,
    after: StageSnapshot,
    audit: StageCompletionAuditEvent,
  ): Promise<boolean> {
    return this.database.transaction((transaction) => {
      const update = transaction
        .update(stages)
        .set({
          state: after.state,
          progress: after.progress,
          done: after.done,
          nextStep: after.nextStep,
          blocker: after.blocker,
          manualLock: after.manualLock,
          updatedFrom: "manual",
          updatedAt: after.updatedAt,
        })
        .where(
          and(
            eq(stages.id, before.id),
            eq(stages.state, before.state),
            eq(stages.updatedAt, before.updatedAt),
          ),
        )
        .run();

      if (update.changes !== 1) return false;

      transaction
        .insert(auditEvents)
        .values({
          id: audit.id,
          actor: audit.actor,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
          beforeJson: JSON.stringify(audit.before),
          afterJson: JSON.stringify(audit.after),
          reason: audit.reason,
          occurredAt: audit.occurredAt,
          source: audit.source,
          confirmed: audit.confirmed,
          correlationId: audit.correlationId,
        })
        .run();
      return true;
    });
  }
}
