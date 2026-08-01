import type {
  CooperativeRunOrigin,
  CooperativeRunSnapshot,
} from "./run-state";

export type { CooperativeRunSnapshot } from "./run-state";

export type RegisterCooperativeRunInput = {
  projectId: string | null;
  title: string;
  actorLabel: string;
  origin: CooperativeRunOrigin;
  phase: string | null;
  branch: string | null;
  initialSummary: string;
  nextAction: string;
  staleAfterSeconds: number;
};

export type CooperativeRunRegistrationContext = {
  actorId: string;
  runId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
};

export type CooperativeRunRegistrationEvent = {
  id: string;
  runId: string;
  kind: "run.registered";
  actor: string;
  summary: string;
  occurredAt: string;
  source: CooperativeRunOrigin;
  idempotencyKey: string;
  correlationId: string;
};

export type CooperativeRunRegistrationStoreResult =
  | "created"
  | "duplicate"
  | "project_not_found"
  | "conflict";

export interface CooperativeRunRegistrationRepository {
  register(
    run: CooperativeRunSnapshot,
    event: CooperativeRunRegistrationEvent,
  ): Promise<CooperativeRunRegistrationStoreResult>;
}

export type CooperativeRunRegistrationValidationError =
  | "RUN_ID_REQUIRED"
  | "EVENT_ID_REQUIRED"
  | "ACTOR_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "PROJECT_ID_INVALID"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "ACTOR_LABEL_REQUIRED"
  | "ACTOR_LABEL_TOO_LONG"
  | "ORIGIN_INVALID"
  | "PHASE_TOO_LONG"
  | "BRANCH_INVALID"
  | "SUMMARY_REQUIRED"
  | "SUMMARY_TOO_LONG"
  | "NEXT_ACTION_REQUIRED"
  | "NEXT_ACTION_TOO_LONG"
  | "STALE_THRESHOLD_INVALID"
  | "NOW_INVALID";

export type CooperativeRunRegistrationResult =
  | {
      ok: true;
      run: CooperativeRunSnapshot;
      event: CooperativeRunRegistrationEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly CooperativeRunRegistrationValidationError[];
    }
  | {
      ok: false;
      code: "DUPLICATE" | "PROJECT_NOT_FOUND" | "CONFLICT";
    };

const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const branchCharacterPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const origins = new Set<CooperativeRunOrigin>([
  "chatgpt",
  "codex",
  "manual",
  "automation",
  "other",
]);
const minimumStaleSeconds = 5 * 60;
const maximumStaleSeconds = 24 * 60 * 60;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = text(value);
  return normalized.length === 0 ? null : normalized;
}

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function isSafeBranchName(value: string): boolean {
  return (
    branchCharacterPattern.test(value) &&
    !/[~^:?*[\\]/u.test(value) &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.startsWith(".") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock") &&
    !value.includes("..") &&
    !value.includes("@{") &&
    !value.includes("//")
  );
}

export class CooperativeRunRegistrationService {
  constructor(
    private readonly repository: CooperativeRunRegistrationRepository,
  ) {}

  async register(
    input: RegisterCooperativeRunInput,
    context: CooperativeRunRegistrationContext,
  ): Promise<CooperativeRunRegistrationResult> {
    const runId = text(context.runId);
    const eventId = text(context.eventId);
    const actorId = text(context.actorId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    const projectId = nullableText(input.projectId);
    const title = text(input.title);
    const actorLabel = text(input.actorLabel);
    const phase = nullableText(input.phase);
    const branch = nullableText(input.branch);
    const summary = text(input.initialSummary);
    const nextAction = text(input.nextAction);
    const now = normalizedIso(context.now);
    const errors: CooperativeRunRegistrationValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (eventId.length === 0) errors.push("EVENT_ID_REQUIRED");
    if (actorId.length === 0) errors.push("ACTOR_ID_REQUIRED");
    if (idempotencyKey.length === 0) {
      errors.push("IDEMPOTENCY_KEY_REQUIRED");
    }
    if (correlationId.length === 0) {
      errors.push("CORRELATION_ID_REQUIRED");
    }
    if (
      projectId !== null &&
      (projectId.length > 200 || !projectIdPattern.test(projectId))
    ) {
      errors.push("PROJECT_ID_INVALID");
    }
    if (title.length === 0) errors.push("TITLE_REQUIRED");
    else if (title.length > 200) errors.push("TITLE_TOO_LONG");
    if (actorLabel.length === 0) errors.push("ACTOR_LABEL_REQUIRED");
    else if (actorLabel.length > 100) errors.push("ACTOR_LABEL_TOO_LONG");
    if (!origins.has(input.origin)) errors.push("ORIGIN_INVALID");
    if (phase !== null && phase.length > 200) errors.push("PHASE_TOO_LONG");
    if (branch !== null && !isSafeBranchName(branch)) {
      errors.push("BRANCH_INVALID");
    }
    if (summary.length === 0) errors.push("SUMMARY_REQUIRED");
    else if (summary.length > 2_000) errors.push("SUMMARY_TOO_LONG");
    if (nextAction.length === 0) errors.push("NEXT_ACTION_REQUIRED");
    else if (nextAction.length > 1_000) errors.push("NEXT_ACTION_TOO_LONG");
    if (
      !Number.isInteger(input.staleAfterSeconds) ||
      input.staleAfterSeconds < minimumStaleSeconds ||
      input.staleAfterSeconds > maximumStaleSeconds
    ) {
      errors.push("STALE_THRESHOLD_INVALID");
    }
    if (now === null) errors.push("NOW_INVALID");

    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const run: CooperativeRunSnapshot = {
      id: runId,
      projectId,
      title,
      actorLabel,
      origin: input.origin,
      status: "running",
      phase,
      progress: 0,
      branch,
      summary,
      blocker: null,
      nextAction,
      startedAt: now,
      lastHeartbeatAt: now,
      finishedAt: null,
      staleAfterSeconds: input.staleAfterSeconds,
      updatedAt: now,
    };
    const event: CooperativeRunRegistrationEvent = {
      id: eventId,
      runId,
      kind: "run.registered",
      actor: actorId,
      summary,
      occurredAt: now,
      source: input.origin,
      idempotencyKey,
      correlationId,
    };

    const stored = await this.repository.register(run, event);
    if (stored === "created") return { ok: true, run, event };
    if (stored === "duplicate") return { ok: false, code: "DUPLICATE" };
    if (stored === "project_not_found") {
      return { ok: false, code: "PROJECT_NOT_FOUND" };
    }
    return { ok: false, code: "CONFLICT" };
  }
}
