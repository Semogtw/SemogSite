import type {
  Confidence,
  Priority,
  ProjectHealth,
  ProjectStatus,
} from "../shared/types";

export type OperationalProjectSummary = {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  health: ProjectHealth;
  priority: Priority;
  progressEstimate: number;
  focus: string;
  nextAction: string;
  branchSummary: string | null;
  confidence: Confidence;
  lastActivityAt: string | null;
  lastSyncedAt: string | null;
};

export type OperationalRepositorySummary = {
  id: string;
  projectId: string | null;
  fullName: string;
  role: "product" | "core" | "integration" | "infrastructure" | "academic" | "experiment";
  visibility: "public" | "private";
  status: "active" | "paused" | "historical" | "experiment";
  defaultBranch: string;
  activeBranch: string | null;
  githubUrl: string;
  lastSyncedAt: string | null;
};

export type ProjectHub = {
  project: OperationalProjectSummary;
  repositories: readonly OperationalRepositorySummary[];
  currentStages: readonly unknown[];
  attention: readonly unknown[];
  evidence: readonly unknown[];
  recentSessions: readonly unknown[];
  nextGate: string | null;
  safetyConstraint: string | null;
  dataSource: string;
  updatedAt: string;
};

export interface ProjectDataSource {
  listProjects(): Promise<readonly OperationalProjectSummary[]>;
  listRepositories(): Promise<readonly OperationalRepositorySummary[]>;
  getProjectHub(slug: string): Promise<ProjectHub | null>;
}

export type OperationalPortfolio = {
  activeProjects: readonly OperationalProjectSummary[];
  activeRepositories: readonly OperationalRepositorySummary[];
  repositoryCatalog: readonly OperationalRepositorySummary[];
};

const priorityRank: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export class ProjectService {
  constructor(private readonly source: ProjectDataSource) {}

  async listOperationalPortfolio(): Promise<OperationalPortfolio> {
    const [projects, repositories] = await Promise.all([
      this.source.listProjects(),
      this.source.listRepositories(),
    ]);

    const activeProjects = projects
      .filter((project) => project.status === "active")
      .sort(
        (left, right) =>
          priorityRank[left.priority] - priorityRank[right.priority] ||
          left.name.localeCompare(right.name),
      );

    return {
      activeProjects,
      activeRepositories: repositories.filter(
        (repository) => repository.status === "active",
      ),
      repositoryCatalog: repositories,
    };
  }

  async getProjectHub(slug: string): Promise<ProjectHub | null> {
    const normalized = slug.trim();
    if (normalized.length === 0) return null;
    return this.source.getProjectHub(normalized);
  }
}
