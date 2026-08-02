import type { ProjectSnapshot } from "../projects/project";
import type { StageSnapshot } from "../roadmap/stage";

export type EvidenceSnapshot = {
  id: string;
  projectId: string;
  stageId: string | null;
  status: "observed" | "passed" | "failed" | "pending" | "superseded";
  title: string;
  url: string | null;
  occurredAt: string;
};

export interface ProjectRepository {
  listActive(): Promise<readonly ProjectSnapshot[]>;
  findBySlug(slug: string): Promise<ProjectSnapshot | null>;
}

export interface StageRepository {
  listForProject(projectId: string): Promise<readonly StageSnapshot[]>;
  listCurrent(): Promise<readonly StageSnapshot[]>;
}

export interface EvidenceRepository {
  listForStage(stageId: string): Promise<readonly EvidenceSnapshot[]>;
}
