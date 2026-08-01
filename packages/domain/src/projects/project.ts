import type {
  Confidence,
  DataSource,
  IsoTimestamp,
  Priority,
  ProjectHealth,
  ProjectStatus,
  Visibility,
} from "../shared/types";

export type ProjectSnapshot = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  priority: Priority;
  progressEstimate: number;
  focus: string;
  nextAction: string;
  branchSummary: string | null;
  statusBasis: string;
  confidence: Confidence;
  visibility: Visibility;
  publicSummary: string | null;
  privateSummary: string | null;
  publicProgress: number | null;
  featured: boolean;
  liveUrl: string | null;
  documentationUrl: string | null;
  lastActivityAt: IsoTimestamp | null;
  lastSyncedAt: IsoTimestamp | null;
  manualLock: boolean;
  dataSource: DataSource;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};
