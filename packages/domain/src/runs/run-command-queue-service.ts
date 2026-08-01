import type {
  CooperativeRunOrigin,
  CooperativeRunSnapshot,
} from "./run-state";

export type CooperativeRunCommandKind =
  | "continue"
  | "pause"
  | "cancel"
  | "reprioritize"
  | "request_checkpoint"
  | "provide_context";

export type CooperativeRunCommandStatus = "queued";

export type CooperativeRunCommandPayload = Readonly<Record<string, unknown>>;

export type QueueCooperativeRunCommandInput = {
  runId: string;
  kind: CooperativeRunCommandKind;
  summary: string;
  payload: unknown;
  expiresAt: string | null;
};

export type CooperativeRunCommandQueueContext = {
  actorId: string;
  commandId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  source: CooperativeRunOrigin;
  now: string;
};

export type CooperativeRunCommand = {
  id: string;
  runId: string;
  kind: CooperativeRunCommandKind;
  status: CooperativeRunCommandStatus;
  summary: string;
  payload: CooperativeRunCommandPayload;
  reason: string | null;
  queuedBy: string;
  idempotencyKey: string;
  correlationId: string;
  queuedAt: string;
  acknowledgedAt: null;
  completedAt: null;
  expiresAt: string | null;
  updatedAt: string;
};

export type CooperativeRunCommandQueuedEvent = {
  id: string;
  runId: string;
  kind: "run.command_queued";
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  command: CooperativeRunCommand;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type CooperativeRunCommandQueueStoreResult =
  | "queued"
  | "duplicate"
  | "conflict";

export interface CooperativeRunCommandQueueRepository {
  findRun(runId: string): Promise<CooperativeRunSnapshot | null>;
  queue(
    run: CooperativeRunSnapshot,
    command: CooperativeRunCommand,
    event: CooperativeRunCommandQueuedEvent,
  ): Promise<CooperativeRunCommandQueueStoreResult>;
}

export type CooperativeRunCommandQueueValidationError =
  | "RUN_ID_REQUIRED"
  | "COMMAND_ID_REQUIRED"
  | "EVENT_ID_REQUIRED"
  | "ACTOR_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "SOURCE_INVALID"
  | "KIND_INVALID"
  | "SUMMARY_REQUIRED"
  | "SUMMARY_TOO_LONG"
  | "PAYLOAD_INVALID"
  | "PAYLOAD_FIELD_INVALID"
  | "PAYLOAD_SENSITIVE"
  | "PAYLOAD_TOO_LARGE"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "PRIORITY_INVALID"
  | "CHECKPOINT_INCLUDE_INVALID"
  | "CONTEXT_REQUIRED"
  | "CONTEXT_TOO_LONG"
  | "NOTE_TOO_LONG"
  | "EXPIRES_AT_INVALID"
  | "EXPIRES_AT_TOO_FAR"
  | "NOW_INVALID";

export type CooperativeRunCommandQueueResult =
  | {
      ok: true;
      command: CooperativeRunCommand;
      event: CooperativeRunCommandQueuedEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly CooperativeRunCommandQueueValidationError[];
    }
  | {
      ok: false;
      code: "RUN_NOT_FOUND" | "TERMINAL_RUN" | "DUPLICATE" | "CONFLICT";
    };

const kinds = new Set<CooperativeRunCommandKind>([
  "continue",
  "pause",
  "cancel",
  "reprioritize",
  "request_checkpoint",
  "provide_context",
]);
const origins = new Set<CooperativeRunOrigin>([
  "chatgpt",
  "codex",
  "manual",
  "automation",
  "other",
]);
const terminalStatuses = new Set<CooperativeRunSnapshot["status"]>([
  "completed",
  "failed",
  "cancelled",
]);
const checkpointSections = new Set([
  "commits",
  "tests",
  "blockers",
  "next_step",
]);
const priorities = new Set(["low", "normal", "high"]);
const maximumPayloadBytes = 16 * 1024;
const maximumExpirationMs = 30 * 24 * 60 * 60 * 1_000;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

function containsSensitiveKey(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const seen = new WeakSet<object>();
  const pending: object[] = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current)) {
      const normalized = normalizedKey(key);
      if (
        normalized === "authorization" ||
        normalized === "cookie" ||
        normalized === "setcookie" ||
        normalized === "credentials" ||
        normalized === "credential" ||
        normalized === "secrets" ||
        normalized === "jwt" ||
        normalized.endsWith("password") ||
        normalized.endsWith("passwordhash") ||
        normalized.endsWith("passworddigest") ||
        normalized.endsWith("token") ||
        normalized.endsWith("tokenvalue") ||
        normalized.endsWith("secret") ||
        normalized.endsWith("secretvalue") ||
        normalized.endsWith("apikey") ||
        normalized.endsWith("privatekey") ||
        normalized.endsWith("sessionid")
      ) {
        return true;
      }
      if (child !== null && typeof child === "object") pending.push(child);
    }
  }

  return false;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function normalizePayload(
  kind: CooperativeRunCommandKind,
  raw: unknown,
): {
  payload: CooperativeRunCommandPayload | null;
  reason: string | null;
  errors: CooperativeRunCommandQueueValidationError[];
} {
  const errors: CooperativeRunCommandQueueValidationError[] = [];
  const value = plainRecord(raw);
  if (value === null) {
    return { payload: null, reason: null, errors: ["PAYLOAD_INVALID"] };
  }
  if (containsSensitiveKey(value)) errors.push("PAYLOAD_SENSITIVE");

  let payload: Record<string, unknown> | null = null;
  let reason: string | null = null;

  if (kind === "continue") {
    if (!hasOnlyKeys(value, ["note"])) errors.push("PAYLOAD_FIELD_INVALID");
    const note = value.note === undefined ? null : text(value.note);
    if (value.note !== undefined && note.length === 0) {
      errors.push("PAYLOAD_INVALID");
    } else if (note !== null && note.length > 1_000) {
      errors.push("NOTE_TOO_LONG");
    }
    payload = note === null ? {} : { note };
  } else if (kind === "pause" || kind === "cancel") {
    if (!hasOnlyKeys(value, ["reason"])) errors.push("PAYLOAD_FIELD_INVALID");
    reason = text(value.reason);
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 2_000) errors.push("REASON_TOO_LONG");
    payload = { reason };
  } else if (kind === "reprioritize") {
    if (!hasOnlyKeys(value, ["priority", "note"])) {
      errors.push("PAYLOAD_FIELD_INVALID");
    }
    const priority = text(value.priority);
    const note = value.note === undefined ? null : text(value.note);
    if (!priorities.has(priority)) errors.push("PRIORITY_INVALID");
    if (value.note !== undefined && note.length === 0) {
      errors.push("PAYLOAD_INVALID");
    } else if (note !== null && note.length > 1_000) {
      errors.push("NOTE_TOO_LONG");
    }
    payload = note === null ? { priority } : { priority, note };
  } else if (kind === "request_checkpoint") {
    if (!hasOnlyKeys(value, ["include"])) errors.push("PAYLOAD_FIELD_INVALID");
    const rawInclude = value.include;
    if (rawInclude === undefined) {
      payload = { include: [] };
    } else if (
      !Array.isArray(rawInclude) ||
      rawInclude.length > checkpointSections.size ||
      rawInclude.some(
        (item) => typeof item !== "string" || !checkpointSections.has(item),
      )
    ) {
      errors.push("CHECKPOINT_INCLUDE_INVALID");
      payload = { include: [] };
    } else {
      payload = { include: [...new Set(rawInclude)] };
    }
  } else {
    if (!hasOnlyKeys(value, ["context"])) errors.push("PAYLOAD_FIELD_INVALID");
    const context = text(value.context);
    if (context.length === 0) errors.push("CONTEXT_REQUIRED");
    else if (context.length > 4_000) errors.push("CONTEXT_TOO_LONG");
    payload = { context };
  }

  if (payload !== null) {
    try {
      const serialized = JSON.stringify(payload);
      if (new TextEncoder().encode(serialized).byteLength > maximumPayloadBytes) {
        errors.push("PAYLOAD_TOO_LARGE");
      }
    } catch {
      errors.push("PAYLOAD_INVALID");
    }
  }

  return { payload, reason, errors };
}

export class CooperativeRunCommandQueueService {
  constructor(private readonly repository: CooperativeRunCommandQueueRepository) {}

  async queue(
    input: QueueCooperativeRunCommandInput,
    context: CooperativeRunCommandQueueContext,
  ): Promise<CooperativeRunCommandQueueResult> {
    const runId = text(input.runId);
    const commandId = text(context.commandId);
    const eventId = text(context.eventId);
    const actorId = text(context.actorId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    const summary = text(input.summary);
    const now = normalizedIso(context.now);
    const errors: CooperativeRunCommandQueueValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (commandId.length === 0) errors.push("COMMAND_ID_REQUIRED");
    if (eventId.length === 0) errors.push("EVENT_ID_REQUIRED");
    if (actorId.length === 0) errors.push("ACTOR_ID_REQUIRED");
    if (idempotencyKey.length === 0) errors.push("IDEMPOTENCY_KEY_REQUIRED");
    if (correlationId.length === 0) errors.push("CORRELATION_ID_REQUIRED");
    if (!origins.has(context.source)) errors.push("SOURCE_INVALID");
    if (!kinds.has(input.kind)) errors.push("KIND_INVALID");
    if (summary.length === 0) errors.push("SUMMARY_REQUIRED");
    else if (summary.length > 1_000) errors.push("SUMMARY_TOO_LONG");
    if (now === null) errors.push("NOW_INVALID");

    const payload = kinds.has(input.kind)
      ? normalizePayload(input.kind, input.payload)
      : { payload: null, reason: null, errors: [] };
    errors.push(...payload.errors);

    let expiresAt: string | null = null;
    if (input.expiresAt !== null) {
      expiresAt = normalizedIso(input.expiresAt);
      if (
        expiresAt === null ||
        now === null ||
        Date.parse(expiresAt) <= Date.parse(now)
      ) {
        errors.push("EXPIRES_AT_INVALID");
      } else if (Date.parse(expiresAt) - Date.parse(now) > maximumExpirationMs) {
        errors.push("EXPIRES_AT_TOO_FAR");
      }
    }

    if (errors.length > 0 || now === null || payload.payload === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const run = await this.repository.findRun(runId);
    if (run === null) return { ok: false, code: "RUN_NOT_FOUND" };
    if (terminalStatuses.has(run.status)) {
      return { ok: false, code: "TERMINAL_RUN" };
    }

    const command: CooperativeRunCommand = {
      id: commandId,
      runId,
      kind: input.kind,
      status: "queued",
      summary,
      payload: payload.payload,
      reason: payload.reason,
      queuedBy: actorId,
      idempotencyKey,
      correlationId,
      queuedAt: now,
      acknowledgedAt: null,
      completedAt: null,
      expiresAt,
      updatedAt: now,
    };
    const event: CooperativeRunCommandQueuedEvent = {
      id: eventId,
      runId,
      kind: "run.command_queued",
      actor: actorId,
      source: context.source,
      summary,
      command,
      occurredAt: now,
      idempotencyKey,
      correlationId,
    };

    const stored = await this.repository.queue(run, command, event);
    if (stored === "queued") return { ok: true, command, event };
    if (stored === "duplicate") return { ok: false, code: "DUPLICATE" };
    return { ok: false, code: "CONFLICT" };
  }
}
