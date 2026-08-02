import {
  deriveRunFreshness,
  type CooperativeRunCheckpointTestsStatus,
  type CooperativeRunOrigin,
  type CooperativeRunSnapshot,
  type CooperativeRunStatus,
  type JsonValue,
  type RunTransitionEventKind,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export type CooperativeRunListItem = CooperativeRunSnapshot & {
  freshness: "current" | "stale";
  staleAt: string | null;
};

export type CooperativeRunHistoryEventKind =
  | RunTransitionEventKind
  | "run.registered"
  | "run.command_queued"
  | "run.command_acknowledged"
  | "run.command_completed"
  | "run.command_rejected";

export type CooperativeRunHistoryEvent = {
  id: string;
  sequence: number;
  kind: CooperativeRunHistoryEventKind;
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before: JsonValue | null;
  after: JsonValue | null;
  occurredAt: string;
  correlationId: string;
  malformedJson: readonly ("before" | "after")[];
};

export type CooperativeRunCheckpointView = {
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

export type CooperativeRunCommandKind =
  | "continue"
  | "pause"
  | "cancel"
  | "reprioritize"
  | "request_checkpoint"
  | "provide_context";

export type CooperativeRunCommandStatus =
  | "queued"
  | "acknowledged"
  | "completed"
  | "rejected"
  | "expired";

export type CooperativeRunCommandAvailability =
  | "available"
  | "expired"
  | "invalid_expiration"
  | "not_applicable";

export type CooperativeRunCommandView = {
  id: string;
  kind: CooperativeRunCommandKind;
  status: CooperativeRunCommandStatus;
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
  queueAvailability: CooperativeRunCommandAvailability;
  malformedPayload: boolean;
};

export type CooperativeRunDetail = {
  run: CooperativeRunListItem;
  events: readonly CooperativeRunHistoryEvent[];
  checkpoints: readonly CooperativeRunCheckpointView[];
  commands: readonly CooperativeRunCommandView[];
};

type RunRow = {
  id: string;
  project_id: string | null;
  title: string;
  actor_label: string;
  origin: CooperativeRunOrigin;
  status: CooperativeRunStatus;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  blocker: string | null;
  next_action: string | null;
  started_at: string;
  last_heartbeat_at: string;
  finished_at: string | null;
  stale_after_seconds: number;
  updated_at: string;
};

type EventRow = {
  id: string;
  sequence: number;
  kind: CooperativeRunHistoryEventKind;
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
};

type CheckpointRow = {
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

type CommandRow = {
  id: string;
  kind: CooperativeRunCommandKind;
  status: CooperativeRunCommandStatus;
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

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function snapshot(row: RunRow): CooperativeRunSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    actorLabel: row.actor_label,
    origin: row.origin,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    branch: row.branch,
    summary: row.summary,
    blocker: row.blocker,
    nextAction: row.next_action,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    finishedAt: row.finished_at,
    staleAfterSeconds: row.stale_after_seconds,
    updatedAt: row.updated_at,
  };
}

function listItem(row: RunRow, observedAt: string): CooperativeRunListItem {
  const value = snapshot(row);
  const freshness = deriveRunFreshness(value, observedAt);
  return {
    ...value,
    freshness: freshness.status,
    staleAt: freshness.staleAt,
  };
}

function parseHistoricalJson(
  value: string | null,
): { value: JsonValue | null; malformed: boolean } {
  if (value === null) return { value: null, malformed: false };
  try {
    return { value: JSON.parse(value) as JsonValue, malformed: false };
  } catch {
    return { value: null, malformed: true };
  }
}

function parseCommitsJson(value: string): {
  commits: readonly string[];
  malformed: boolean;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? { commits: parsed, malformed: false }
      : { commits: [], malformed: true };
  } catch {
    return { commits: [], malformed: true };
  }
}

function deriveCommandAvailability(
  status: CooperativeRunCommandStatus,
  expiresAt: string | null,
  observedAt: string,
): CooperativeRunCommandAvailability {
  if (status !== "queued") return "not_applicable";
  if (expiresAt === null) return "available";
  const expiresEpoch = Date.parse(expiresAt);
  if (Number.isNaN(expiresEpoch)) return "invalid_expiration";
  return expiresEpoch <= Date.parse(observedAt) ? "expired" : "available";
}

function parsePayloadJson(value: string): {
  payload: Readonly<Record<string, JsonValue>> | null;
  malformed: boolean;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { payload: null, malformed: true };
    }
    return {
      payload: parsed as Readonly<Record<string, JsonValue>>,
      malformed: false,
    };
  } catch {
    return { payload: null, malformed: true };
  }
}

const runSelect = `
  SELECT id, project_id, title, actor_label, origin, status, phase, progress,
         branch, summary, blocker, next_action, started_at, last_heartbeat_at,
         finished_at, stale_after_seconds, updated_at
  FROM cooperative_runs`;

export class SqliteCooperativeRunReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async listRuns(input: {
    observedAt: string;
    limit: number;
  }): Promise<readonly CooperativeRunListItem[]> {
    if (Number.isNaN(Date.parse(input.observedAt))) {
      throw new Error("RUN_OBSERVED_AT_INVALID");
    }
    const observedAt = new Date(Date.parse(input.observedAt)).toISOString();
    const rows = this.database.$client
      .prepare(
        `${runSelect}
         ORDER BY updated_at DESC, id ASC
         LIMIT ?`,
      )
      .all(normalizeLimit(input.limit)) as RunRow[];

    return rows.map((row) => listItem(row, observedAt));
  }

  async getRun(
    runId: string,
    observedAtValue: string,
  ): Promise<CooperativeRunDetail | null> {
    if (Number.isNaN(Date.parse(observedAtValue))) {
      throw new Error("RUN_OBSERVED_AT_INVALID");
    }
    const observedAt = new Date(Date.parse(observedAtValue)).toISOString();
    const row = this.database.$client
      .prepare(`${runSelect} WHERE id = ?`)
      .get(runId) as RunRow | undefined;
    if (row === undefined) return null;

    const eventRows = this.database.$client
      .prepare(
        `SELECT id, sequence, kind, actor, source, summary, before_json,
                after_json, occurred_at, correlation_id
         FROM cooperative_run_events
         WHERE run_id = ?
         ORDER BY sequence DESC, id DESC
         LIMIT 200`,
      )
      .all(runId) as EventRow[];
    const checkpointRows = this.database.$client
      .prepare(
        `SELECT id, event_id, sequence, phase, progress, branch, summary,
                commits_json, tests_status, tests_summary, blockers, next_step,
                captured_at, source_hash
         FROM cooperative_run_checkpoints
         WHERE run_id = ?
         ORDER BY sequence DESC, id DESC
         LIMIT 100`,
      )
      .all(runId) as CheckpointRow[];
    const commandRows = this.database.$client
      .prepare(
        `SELECT id, kind, status, summary, payload_json, reason, queued_by,
                correlation_id, queued_at, acknowledged_at, completed_at,
                expires_at, updated_at
         FROM cooperative_run_commands
         WHERE run_id = ?
         ORDER BY queued_at DESC, id DESC
         LIMIT 100`,
      )
      .all(runId) as CommandRow[];

    const events = eventRows.map((event): CooperativeRunHistoryEvent => {
      const before = parseHistoricalJson(event.before_json);
      const after = parseHistoricalJson(event.after_json);
      const malformedJson: ("before" | "after")[] = [];
      if (before.malformed) malformedJson.push("before");
      if (after.malformed) malformedJson.push("after");
      return {
        id: event.id,
        sequence: event.sequence,
        kind: event.kind,
        actor: event.actor,
        source: event.source,
        summary: event.summary,
        before: before.value,
        after: after.value,
        occurredAt: event.occurred_at,
        correlationId: event.correlation_id,
        malformedJson,
      };
    });
    const checkpoints = checkpointRows.map(
      (checkpoint): CooperativeRunCheckpointView => {
        const commits = parseCommitsJson(checkpoint.commits_json);
        return {
          id: checkpoint.id,
          eventId: checkpoint.event_id,
          sequence: checkpoint.sequence,
          phase: checkpoint.phase,
          progress: checkpoint.progress,
          branch: checkpoint.branch,
          summary: checkpoint.summary,
          commits: commits.commits,
          testsStatus: checkpoint.tests_status,
          testsSummary: checkpoint.tests_summary,
          blockers: checkpoint.blockers,
          nextStep: checkpoint.next_step,
          capturedAt: checkpoint.captured_at,
          sourceHash: checkpoint.source_hash,
          malformedCommits: commits.malformed,
        };
      },
    );
    const commands = commandRows.map((command): CooperativeRunCommandView => {
      const payload = parsePayloadJson(command.payload_json);
      return {
        id: command.id,
        kind: command.kind,
        status: command.status,
        summary: command.summary,
        payload: payload.payload,
        reason: command.reason,
        queuedBy: command.queued_by,
        correlationId: command.correlation_id,
        queuedAt: command.queued_at,
        acknowledgedAt: command.acknowledged_at,
        completedAt: command.completed_at,
        expiresAt: command.expires_at,
        updatedAt: command.updated_at,
        queueAvailability: deriveCommandAvailability(
          command.status,
          command.expires_at,
          observedAt,
        ),
        malformedPayload: payload.malformed,
      };
    });

    return {
      run: listItem(row, observedAt),
      events,
      checkpoints,
      commands,
    };
  }
}
