import type {
  OperationalProjectSummary,
  OperationalRepositorySummary,
  ProjectDataSource,
  ProjectHub,
} from "@semogtw/domain";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import {
  attentionItems,
  developmentSessions,
  evidence,
} from "../schema/operations";
import { projects, repositories } from "../schema/projects";
import { stages, workstreams } from "../schema/roadmap";

export class SqliteProjectDataSource implements ProjectDataSource {
  constructor(private readonly database: SqliteDatabase) {}

  async listProjects(): Promise<readonly OperationalProjectSummary[]> {
    return this.database
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        status: projects.status,
        health: projects.health,
        priority: projects.priority,
        progressEstimate: projects.progressEstimate,
        focus: projects.focus,
        nextAction: projects.nextAction,
        branchSummary: projects.branchSummary,
        confidence: projects.confidence,
        lastActivityAt: projects.lastActivityAt,
        lastSyncedAt: projects.lastSyncedAt,
      })
      .from(projects)
      .orderBy(asc(projects.name))
      .all();
  }

  async listRepositories(): Promise<readonly OperationalRepositorySummary[]> {
    return this.database
      .select({
        id: repositories.id,
        projectId: repositories.projectId,
        fullName: repositories.fullName,
        role: repositories.role,
        visibility: repositories.visibility,
        status: repositories.status,
        defaultBranch: repositories.defaultBranch,
        activeBranch: repositories.activeBranch,
        githubUrl: repositories.githubUrl,
        lastSyncedAt: repositories.lastSyncedAt,
      })
      .from(repositories)
      .orderBy(asc(repositories.fullName))
      .all();
  }

  async getProjectHub(slug: string): Promise<ProjectHub | null> {
    const projectRow = this.database
      .select()
      .from(projects)
      .where(eq(projects.slug, slug))
      .get();
    if (projectRow === undefined) return null;

    const [
      projectRepositories,
      currentStages,
      attention,
      projectEvidence,
      recentSessions,
      nextWorkstream,
    ] = await Promise.all([
      Promise.resolve(
        this.database
          .select()
          .from(repositories)
          .where(eq(repositories.projectId, projectRow.id))
          .orderBy(asc(repositories.fullName))
          .all(),
      ),
      Promise.resolve(
        this.database
          .select()
          .from(stages)
          .where(
            inArray(stages.state, ["next", "in_progress", "blocked"]),
          )
          .orderBy(asc(stages.orderIndex))
          .all()
          .filter((stage) => stage.projectId === projectRow.id),
      ),
      Promise.resolve(
        this.database
          .select()
          .from(attentionItems)
          .where(
            inArray(attentionItems.status, ["open", "monitoring"]),
          )
          .orderBy(desc(attentionItems.updatedAt))
          .all()
          .filter((item) => item.projectId === projectRow.id),
      ),
      Promise.resolve(
        this.database
          .select()
          .from(evidence)
          .where(eq(evidence.projectId, projectRow.id))
          .orderBy(desc(evidence.occurredAt))
          .limit(20)
          .all(),
      ),
      Promise.resolve(
        this.database
          .select()
          .from(developmentSessions)
          .where(eq(developmentSessions.projectId, projectRow.id))
          .orderBy(desc(developmentSessions.sessionDate))
          .limit(10)
          .all(),
      ),
      Promise.resolve(
        this.database
          .select({ nextGate: workstreams.nextGate })
          .from(workstreams)
          .where(
            inArray(workstreams.status, ["active", "validating", "blocked"]),
          )
          .orderBy(asc(workstreams.updatedAt))
          .all()
          .find((stream) => stream.nextGate.length > 0) ?? null,
      ),
    ]);

    const project: OperationalProjectSummary = {
      id: projectRow.id,
      slug: projectRow.slug,
      name: projectRow.name,
      status: projectRow.status,
      health: projectRow.health,
      priority: projectRow.priority,
      progressEstimate: projectRow.progressEstimate,
      focus: projectRow.focus,
      nextAction: projectRow.nextAction,
      branchSummary: projectRow.branchSummary,
      confidence: projectRow.confidence,
      lastActivityAt: projectRow.lastActivityAt,
      lastSyncedAt: projectRow.lastSyncedAt,
    };

    const repositorySummaries: OperationalRepositorySummary[] =
      projectRepositories.map((repository) => ({
        id: repository.id,
        projectId: repository.projectId,
        fullName: repository.fullName,
        role: repository.role,
        visibility: repository.visibility,
        status: repository.status,
        defaultBranch: repository.defaultBranch,
        activeBranch: repository.activeBranch,
        githubUrl: repository.githubUrl,
        lastSyncedAt: repository.lastSyncedAt,
      }));

    return {
      project,
      repositories: repositorySummaries,
      currentStages,
      attention,
      evidence: projectEvidence,
      recentSessions,
      nextGate: nextWorkstream?.nextGate ?? null,
      safetyConstraint: null,
      dataSource: projectRow.dataSource,
      updatedAt: projectRow.updatedAt,
    };
  }
}
