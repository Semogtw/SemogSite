import type { StageRepository, StageSnapshot } from "@semogtw/domain";
import { asc, eq, inArray } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { evidence } from "../schema/operations";
import { stages } from "../schema/roadmap";

type StageRow = typeof stages.$inferSelect;

export class SqliteStageRepository implements StageRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async listForProject(projectId: string): Promise<readonly StageSnapshot[]> {
    const rows = this.database
      .select()
      .from(stages)
      .where(eq(stages.projectId, projectId))
      .orderBy(asc(stages.orderIndex))
      .all();
    return this.hydrate(rows);
  }

  async listCurrent(): Promise<readonly StageSnapshot[]> {
    const rows = this.database
      .select()
      .from(stages)
      .where(inArray(stages.state, ["in_progress", "blocked"]))
      .orderBy(asc(stages.orderIndex))
      .all();
    return this.hydrate(rows);
  }

  private hydrate(rows: readonly StageRow[]): readonly StageSnapshot[] {
    if (rows.length === 0) return [];
    const stageIds = rows.map((row) => row.id);
    const evidenceRows = this.database
      .select({ id: evidence.id, stageId: evidence.stageId, status: evidence.status })
      .from(evidence)
      .where(inArray(evidence.stageId, stageIds))
      .all();

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      state: row.state,
      progress: row.progress,
      done: row.done,
      nextStep: row.nextStep,
      blocker: row.blocker,
      evidence: evidenceRows
        .filter((item) => item.stageId === row.id)
        .map((item) => ({ id: item.id, status: item.status })),
      manualLock: row.manualLock,
      updatedAt: row.updatedAt,
    }));
  }
}
