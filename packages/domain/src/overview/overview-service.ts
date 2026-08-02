import type { Priority, ProjectHealth } from "../shared/types";

export type OverviewProject = {
  id: string;
  slug: string;
  name: string;
  priority: Priority;
  health: ProjectHealth;
  progressEstimate: number;
  focus: string;
  nextAction: string;
  branchSummary: string | null;
  lastActivityAt: string | null;
  lastSyncedAt: string | null;
};

export type OverviewStage = {
  id: string;
  projectId: string;
  title: string;
  state: "in_progress" | "blocked";
  progress: number;
  orderIndex: number;
};

export type OverviewAttention = {
  id: string;
  projectId: string | null;
  title: string;
  impact: "high" | "medium" | "low";
  owner: "owner" | "gpt" | "external_environment" | "shared";
  nextAction: string;
};

export interface OverviewDataSource {
  listActiveProjects(): Promise<readonly OverviewProject[]>;
  listCurrentStages(): Promise<readonly OverviewStage[]>;
  listOpenAttention(): Promise<readonly OverviewAttention[]>;
  getLastSuccessfulSyncAt(): Promise<string | null>;
}

export type DevOSOverview = {
  activeProjectCount: number;
  inProgressStageCount: number;
  highImpactAttentionCount: number;
  projects: readonly OverviewProject[];
  currentStages: readonly OverviewStage[];
  attention: readonly OverviewAttention[];
  lastSyncedAt: string | null;
};

export class OverviewService {
  constructor(private readonly source: OverviewDataSource) {}

  async getOverview(): Promise<DevOSOverview> {
    const [projects, stages, attention, lastSyncedAt] = await Promise.all([
      this.source.listActiveProjects(),
      this.source.listCurrentStages(),
      this.source.listOpenAttention(),
      this.source.getLastSuccessfulSyncAt(),
    ]);

    const currentStages = projects.flatMap((project) =>
      stages
        .filter((stage) => stage.projectId === project.id)
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .slice(0, 2),
    );

    return {
      activeProjectCount: projects.length,
      inProgressStageCount: stages.filter(
        (stage) => stage.state === "in_progress",
      ).length,
      highImpactAttentionCount: attention.filter(
        (item) => item.impact === "high",
      ).length,
      projects,
      currentStages,
      attention,
      lastSyncedAt,
    };
  }
}
