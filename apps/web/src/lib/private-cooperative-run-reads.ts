import type { CooperativeRunSnapshot, JsonValue } from "@semogtw/domain";
import { PrivateApiError } from "./private-api-client";
import type { PrivateReadClient } from "./private-mutation-client";

export type PrivateCooperativeRunFreshness = {
  heartbeatAgeSeconds: number;
  heartbeatExpired: boolean;
};

export type PrivateCooperativeRun = CooperativeRunSnapshot & {
  freshness: PrivateCooperativeRunFreshness;
};

export type PrivateCooperativeRunCursor = {
  updatedAt: string;
  id: string;
};

export type PrivateCooperativeRunListInput = {
  limit?: number;
  projectId?: string;
  runningOnly?: boolean;
  cursor?: PrivateCooperativeRunCursor;
};

export type PrivateCooperativeRunListResult = {
  runs: readonly PrivateCooperativeRun[];
  asOf: string;
  nextCursor: PrivateCooperativeRunCursor | null;
};

export type PrivateCooperativeRunEvent = {
  id: string;
  sequence: number;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type PrivateCooperativeRunCheckpoint = {
  id: string;
  eventId: string;
  sequence: number;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  commits: readonly string[];
  testsStatus: "not_run" | "partial" | "passed" | "failed" | "blocked";
  testsSummary: string;
  blockers: string;
  nextStep: string;
  capturedAt: string;
  sourceHash: string | null;
  malformedCommits: boolean;
};

export type PrivateCooperativeRunCommand = {
  id: string;
  kind:
    | "continue"
    | "pause"
    | "cancel"
    | "reprioritize"
    | "request_checkpoint"
    | "provide_context";
  status: "queued" | "acknowledged" | "completed" | "rejected" | "expired";
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
  queueAvailability:
    | "available"
    | "expired"
    | "invalid_expiration"
    | "not_applicable";
  malformedPayload: boolean;
};

export type PrivateCooperativeRunDetailInput = {
  runId: string;
  eventLimit?: number;
  beforeSequence?: number;
  includeSnapshots?: boolean;
};

export type PrivateCooperativeRunDetailResult = {
  run: PrivateCooperativeRun;
  events: readonly PrivateCooperativeRunEvent[];
  checkpoints: readonly PrivateCooperativeRunCheckpoint[];
  commands: readonly PrivateCooperativeRunCommand[];
  observedAt: string;
  nextEventCursor: number | null;
};

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Private run read limit must be between 1 and ${maximum}.`);
  }
  return value;
}

function privatePath(path: string): `/api/v1/private/${string}` {
  return path as `/api/v1/private/${string}`;
}

export function listPrivateCooperativeRuns(
  client: PrivateReadClient,
  input: PrivateCooperativeRunListInput = {},
): Promise<PrivateCooperativeRunListResult> {
  const query = new URLSearchParams();
  query.set("limit", String(boundedInteger(input.limit, 50, 100)));
  if (input.projectId !== undefined) query.set("projectId", input.projectId);
  if (input.runningOnly !== undefined) {
    query.set("runningOnly", input.runningOnly ? "true" : "false");
  }
  if (input.cursor !== undefined) {
    query.set("beforeUpdatedAt", input.cursor.updatedAt);
    query.set("beforeId", input.cursor.id);
  }
  return client.read<PrivateCooperativeRunListResult>(
    privatePath(`/api/v1/private/cooperative-runs?${query.toString()}`),
  );
}

export async function getPrivateCooperativeRun(
  client: PrivateReadClient,
  input: PrivateCooperativeRunDetailInput,
): Promise<PrivateCooperativeRunDetailResult | null> {
  const runId = input.runId.trim();
  if (runId.length === 0) throw new Error("Private run read requires a run id.");

  const query = new URLSearchParams();
  query.set("eventLimit", String(boundedInteger(input.eventLimit, 100, 200)));
  if (input.beforeSequence !== undefined) {
    query.set("beforeSequence", String(boundedInteger(input.beforeSequence, 1, Number.MAX_SAFE_INTEGER)));
  }
  query.set("includeSnapshots", input.includeSnapshots === true ? "true" : "false");

  try {
    return await client.read<PrivateCooperativeRunDetailResult>(
      privatePath(
        `/api/v1/private/cooperative-runs/${encodeURIComponent(runId)}?${query.toString()}`,
      ),
    );
  } catch (error) {
    if (error instanceof PrivateApiError && error.code === "RUN_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}
