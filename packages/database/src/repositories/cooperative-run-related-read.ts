import type {
  CooperativeRunCheckpointTestsStatus,
  JsonValue,
} from "@semogtw/domain";

export type CooperativeRunCheckpointRead = {
  id: string;
  eventId: string;
  sequence: number;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  commits: readonly string[];
  testsStatus: CooperativeRunCheckpointTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  capturedAt: string;
  sourceHash: string | null;
  malformedCommits: boolean;
};

export type CooperativeRunCommandReadKind =
  | "continue"
  | "pause"
  | "cancel"
  | "reprioritize"
  | "request_checkpoint"
  | "provide_context";

export type CooperativeRunCommandReadStatus =
  | "queued"
  | "acknowledged"
  | "completed"
  | "rejected"
  | "expired";

export type CooperativeRunCommandReadAvailability =
  | "available"
  | "expired"
  | "invalid_expiration"
  | "not_applicable";

export type CooperativeRunCommandRead = {
  id: string;
  kind: CooperativeRunCommandReadKind;
  status: CooperativeRunCommandReadStatus;
  summary: string;
  payload: Readonly<Record<string, JsonValue>> | null;
  reason: string | null;
  queuedBy: string;
  correlationId: string;
  queuedAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  queueAvailability: CooperativeRunCommandReadAvailability;
  malformedPayload: boolean;
};

export type CooperativeRunCheckpointRow = {
  id: string;
  event_id: string;
  sequence: number;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  commits_json: string;
  tests_status: CooperativeRunCheckpointTestsStatus;
  tests_summary: string;
  blockers: string;
  next_step: string;
  captured_at: string;
  source_hash: string | null;
};

export type CooperativeRunCommandRow = {
  id: string;
  kind: CooperativeRunCommandReadKind;
  status: CooperativeRunCommandReadStatus;
  summary: string;
  payload_json: string;
  reason: string | null;
  queued_by: string;
  correlation_id: string;
  queued_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

export function normalizeCooperativeRunReadLimit(
  limit: number,
  maximum: number,
): number {
  if (!Number.isFinite(limit)) return maximum;
  return Math.min(maximum, Math.max(1, Math.floor(limit)));
}

export function mapCooperativeRunCheckpoint(
  row: CooperativeRunCheckpointRow,
): CooperativeRunCheckpointRead {
  let commits: readonly string[] = [];
  let malformedCommits = false;
  try {
    const parsed = JSON.parse(row.commits_json) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      commits = parsed;
    } else {
      malformedCommits = true;
    }
  } catch {
    malformedCommits = true;
  }

  return {
    id: row.id,
    eventId: row.event_id,
    sequence: row.sequence,
    phase: row.phase,
    progress: row.progress,
    branch: row.branch,
    summary: row.summary,
    commits,
    testsStatus: row.tests_status,
    testsSummary: row.tests_summary,
    blockers: row.blockers,
    nextStep: row.next_step,
    capturedAt: row.captured_at,
    sourceHash: row.source_hash,
    malformedCommits,
  };
}

function commandAvailability(
  status: CooperativeRunCommandReadStatus,
  expiresAt: string | null,
  observedAt: string,
): CooperativeRunCommandReadAvailability {
  if (status !== "queued") return "not_applicable";
  if (expiresAt === null) return "available";
  const expiresEpoch = Date.parse(expiresAt);
  const observedEpoch = Date.parse(observedAt);
  if (Number.isNaN(expiresEpoch) || Number.isNaN(observedEpoch)) {
    return "invalid_expiration";
  }
  return expiresEpoch <= observedEpoch ? "expired" : "available";
}

export function mapCooperativeRunCommand(
  row: CooperativeRunCommandRow,
  observedAt: string,
): CooperativeRunCommandRead {
  let payload: Readonly<Record<string, JsonValue>> | null = null;
  let malformedPayload = false;
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Readonly<Record<string, JsonValue>>;
    } else {
      malformedPayload = true;
    }
  } catch {
    malformedPayload = true;
  }

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    payload,
    reason: row.reason,
    queuedBy: row.queued_by,
    correlationId: row.correlation_id,
    queuedAt: row.queued_at,
    acknowledgedAt: row.acknowledged_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    queueAvailability: commandAvailability(row.status, row.expires_at, observedAt),
    malformedPayload,
  };
}
