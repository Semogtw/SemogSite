export type { ProjectSnapshot } from "./projects/project";
export type {
  DomainValidationResult,
  EvidenceStatus,
  StageEvidence,
  StageSnapshot,
  StageState,
  StageValidationError,
} from "./roadmap/stage";
export { validateStage } from "./roadmap/stage";
export type {
  EvidenceRepository,
  EvidenceSnapshot,
  ProjectRepository,
  StageRepository,
} from "./ports/repositories";
export type {
  Confidence,
  DataSource,
  IsoTimestamp,
  Priority,
  ProjectHealth,
  ProjectStatus,
  Visibility,
} from "./shared/types";
