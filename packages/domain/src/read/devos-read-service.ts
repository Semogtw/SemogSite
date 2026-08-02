import type { DevOSOverview } from "../overview/overview-service";
import type {
  OperationalPortfolio,
  ProjectHub,
} from "../projects/project-service";
import type {
  RoadmapArea,
  RoadmapFilters,
  RoadmapResult,
} from "../roadmap/roadmap-service";
import type { StageState } from "../roadmap/stage";
import type { TodayQueue } from "../today/today-service";

export type DevOSReadDependencies = {
  overview: {
    getOverview(): Promise<DevOSOverview>;
  };
  today: {
    getQueue(): Promise<TodayQueue>;
  };
  projects: {
    listOperationalPortfolio(): Promise<OperationalPortfolio>;
    getProjectHub(slug: string): Promise<ProjectHub | null>;
  };
  roadmap: {
    query(filters: RoadmapFilters): Promise<RoadmapResult>;
  };
};

export type DevOSRoadmapQueryInput = {
  projectIds: readonly string[];
  states: readonly string[];
  areas: readonly string[];
  includeCompleted: boolean;
};

export type DevOSReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" };

const projectSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const projectIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const stageStates = new Set<StageState>([
  "backlog",
  "next",
  "in_progress",
  "blocked",
  "completed",
]);
const roadmapAreas = new Set<RoadmapArea>([
  "planning",
  "implementation",
  "integration",
  "validation",
  "release",
  "operation",
]);

function uniqueNormalized(values: readonly string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeRoadmapFilters(
  input: DevOSRoadmapQueryInput,
): RoadmapFilters | null {
  if (
    input.projectIds.length > 50 ||
    input.states.length > stageStates.size ||
    input.areas.length > roadmapAreas.size ||
    typeof input.includeCompleted !== "boolean"
  ) {
    return null;
  }

  const projectIds = uniqueNormalized(input.projectIds);
  const states = uniqueNormalized(input.states);
  const areas = uniqueNormalized(input.areas);

  if (
    projectIds.some((projectId) => !projectIdPattern.test(projectId)) ||
    states.some((state) => !stageStates.has(state as StageState)) ||
    areas.some((area) => !roadmapAreas.has(area as RoadmapArea))
  ) {
    return null;
  }

  return {
    projectIds,
    states: states as StageState[],
    areas: areas as RoadmapArea[],
    includeCompleted: input.includeCompleted,
  };
}

export class DevOSReadService {
  constructor(private readonly dependencies: DevOSReadDependencies) {}

  async getOverview(): Promise<DevOSOverview> {
    return this.dependencies.overview.getOverview();
  }

  async getToday(): Promise<TodayQueue> {
    return this.dependencies.today.getQueue();
  }

  async listProjects(): Promise<OperationalPortfolio> {
    return this.dependencies.projects.listOperationalPortfolio();
  }

  async getProject(slug: string): Promise<DevOSReadResult<ProjectHub>> {
    const normalized = slug.trim();
    if (!projectSlugPattern.test(normalized)) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    const project = await this.dependencies.projects.getProjectHub(normalized);
    return project === null
      ? { ok: false, code: "NOT_FOUND" }
      : { ok: true, data: project };
  }

  async queryRoadmap(
    input: DevOSRoadmapQueryInput,
  ): Promise<DevOSReadResult<RoadmapResult>> {
    const filters = normalizeRoadmapFilters(input);
    if (filters === null) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    return {
      ok: true,
      data: await this.dependencies.roadmap.query(filters),
    };
  }
}
