import type {
  OverviewAttention,
  OverviewDataSource,
  OverviewProject,
  OverviewStage,
} from "@semogtw/domain";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { syncRuns } from "../schema/audit";
import { attentionItems } from "../schema/operations";
import { projects } from "../schema/projects";
import { stages } from "../schema/roadmap";

const priorityOrder = sql<number>`CASE ${projects.priority}
  WHEN 'critical' THEN 0
  WHEN 'high' THEN 1
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 3
  ELSE 4
END`;

export class SqliteOverviewDataSource implements OverviewDataSource {
  constructor(private readonly database: SqliteDatabase) {}

  async listActiveProjects(): Promise<readonly OverviewProject[]> {
    return this.database
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        priority: projects.priority,
        health: projects.health,
        progressEstimate: projects.progressEstimate,
        focus: projects.focus,
        nextAction: projects.nextAction,
        branchSummary: projects.branchSummary,
        lastActivityAt: projects.lastActivityAt,
        lastSyncedAt: projects.lastSyncedAt,
      })
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(priorityOrder, asc(projects.name))
      .all();
  }

  async listCurrentStages(): Promise<readonly OverviewStage[]> {
    return this.database
      .select({
        id: stages.id,
        projectId: stages.projectId,
        title: stages.title,
        state: stages.state,
        progress: stages.progress,
        orderIndex: stages.orderIndex,
      })
      .from(stages)
      .where(inArray(stages.state, ["in_progress", "blocked"]))
      .orderBy(asc(stages.projectId), asc(stages.orderIndex))
      .all();
  }

  async listOpenAttention(): Promise<readonly OverviewAttention[]> {
    return this.database
      .select({
        id: attentionItems.id,
        projectId: attentionItems.projectId,
        title: attentionItems.title,
        impact: attentionItems.impact,
        owner: attentionItems.owner,
        nextAction: attentionItems.nextAction,
      })
      .from(attentionItems)
      .where(inArray(attentionItems.status, ["open", "monitoring"]))
      .orderBy(asc(attentionItems.updatedAt))
      .all();
  }

  async getLastSuccessfulSyncAt(): Promise<string | null> {
    return (
      this.database
        .select({ finishedAt: syncRuns.finishedAt })
        .from(syncRuns)
        .where(eq(syncRuns.status, "success"))
        .orderBy(desc(syncRuns.finishedAt))
        .limit(1)
        .get()?.finishedAt ?? null
    );
  }
}
