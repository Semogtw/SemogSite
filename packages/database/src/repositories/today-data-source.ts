import type {
  TodayActivityItem,
  TodayAttentionItem,
  TodayDataSource,
  TodayWorkItem,
} from "@semogtw/domain";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { syncRuns } from "../schema/audit";
import {
  attentionItems,
  developmentSessions,
  evidence,
} from "../schema/operations";
import { projects } from "../schema/projects";
import { stages } from "../schema/roadmap";

export class SqliteTodayDataSource implements TodayDataSource {
  constructor(private readonly database: SqliteDatabase) {}

  private async listWorkByState(
    state: "in_progress" | "next",
  ): Promise<readonly TodayWorkItem[]> {
    const rows = this.database
      .select({
        stageId: stages.id,
        projectId: projects.id,
        projectName: projects.name,
        projectPriority: projects.priority,
        title: stages.title,
        progress: stages.progress,
        currentPosition: stages.currentPosition,
        nextStep: stages.nextStep,
        blocker: stages.blocker,
        orderIndex: stages.orderIndex,
        updatedAt: stages.updatedAt,
      })
      .from(stages)
      .innerJoin(projects, eq(stages.projectId, projects.id))
      .where(
        and(
          eq(projects.status, "active"),
          eq(stages.state, state),
          isNotNull(stages.nextStep),
        ),
      )
      .all();

    return rows.map((row) => {
      const latestEvidence = this.database
        .select({
          title: evidence.title,
          status: evidence.status,
          occurredAt: evidence.occurredAt,
        })
        .from(evidence)
        .where(eq(evidence.stageId, row.stageId))
        .orderBy(desc(evidence.occurredAt))
        .limit(1)
        .get();

      return {
        stageId: row.stageId,
        projectId: row.projectId,
        projectName: row.projectName,
        projectPriority: row.projectPriority,
        title: row.title,
        progress: row.progress,
        currentPosition: row.currentPosition,
        nextStep: row.nextStep ?? "",
        partiallyBlocked: row.blocker !== null,
        orderIndex: row.orderIndex,
        updatedAt: row.updatedAt,
        latestEvidence: latestEvidence ?? null,
      };
    });
  }

  async listCurrentWork(): Promise<readonly TodayWorkItem[]> {
    return this.listWorkByState("in_progress");
  }

  async listNextWork(): Promise<readonly TodayWorkItem[]> {
    return this.listWorkByState("next");
  }

  private listAttentionByOwners(
    owners: readonly ("owner" | "shared" | "external_environment")[],
  ): readonly TodayAttentionItem[] {
    return this.database
      .select({
        id: attentionItems.id,
        projectId: attentionItems.projectId,
        projectName: projects.name,
        title: attentionItems.title,
        impact: attentionItems.impact,
        nextAction: attentionItems.nextAction,
      })
      .from(attentionItems)
      .leftJoin(projects, eq(attentionItems.projectId, projects.id))
      .where(
        and(
          inArray(attentionItems.status, ["open", "monitoring"]),
          inArray(attentionItems.owner, owners),
        ),
      )
      .orderBy(desc(attentionItems.updatedAt))
      .all();
  }

  async listOwnerAttention(): Promise<readonly TodayAttentionItem[]> {
    return this.listAttentionByOwners(["owner", "shared"]);
  }

  async listExternalDependencies(): Promise<readonly TodayAttentionItem[]> {
    return this.listAttentionByOwners(["external_environment"]);
  }

  async listRecentActivity(): Promise<readonly TodayActivityItem[]> {
    const sessions: TodayActivityItem[] = this.database
      .select({
        id: developmentSessions.id,
        title: developmentSessions.title,
        occurredAt: developmentSessions.sessionDate,
        projectId: developmentSessions.projectId,
      })
      .from(developmentSessions)
      .orderBy(desc(developmentSessions.sessionDate))
      .limit(20)
      .all()
      .map((session) => ({ ...session, kind: "session" as const }));

    const syncs: TodayActivityItem[] = this.database
      .select({
        id: syncRuns.id,
        scope: syncRuns.scope,
        occurredAt: syncRuns.startedAt,
      })
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(20)
      .all()
      .map((sync) => ({
        id: sync.id,
        kind: "sync" as const,
        title: `Sincronização: ${sync.scope}`,
        occurredAt: sync.occurredAt,
        projectId: null,
      }));

    return [...sessions, ...syncs];
  }
}
