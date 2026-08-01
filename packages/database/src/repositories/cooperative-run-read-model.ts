import {
  deriveRunFreshness,
  type CooperativeRunOrigin,
  type CooperativeRunSnapshot,
  type CooperativeRunStatus,
  type RunTransitionEventKind,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export type CooperativeRunListItem = CooperativeRunSnapshot & {
  freshness: "current" | "stale";
  staleAt: string | null;
};

export type CooperativeRunHistoryEvent = {
  id: string;
  sequence: number;
  kind: RunTransitionEventKind | "run.registered";
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before: unknown | null;
  after: unknown | null;
  occurredAt: string;
  correlationId: string;
  malformedJson: readonly ("before" | "after")[];
};

export type CooperativeRunDetail = {
  run: CooperativeRunListItem;
  events: readonly CooperativeRunHistoryEvent[];
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
  kind: CooperativeRunHistoryEvent["kind"];
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
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
): { value: unknown | null; malformed: boolean } {
  if (value === null) return { value: null, malformed: false };
  try {
    return { value: JSON.parse(value) as unknown, malformed: false };
  } catch {
    return { value: null, malformed: true };
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
         ORDER BY sequence DESC, id DESC`,
      )
      .all(runId) as EventRow[];

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

    return {
      run: listItem(row, observedAt),
      events,
    };
  }
}
