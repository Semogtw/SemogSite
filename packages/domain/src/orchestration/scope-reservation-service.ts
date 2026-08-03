import {
  deriveScopeReservationFreshness,
  normalizeScopePatterns,
  scopeReservationsOverlap,
  type ScopeReservationKind,
  type ScopeReservationSnapshot,
} from "./scope-reservation";

export type { ScopeReservationSnapshot } from "./scope-reservation";

export type AcquireScopeReservationInput = {
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  branch: string;
  kind: ScopeReservationKind;
  patterns: readonly string[];
  holderLabel: string;
  purpose: string;
  ttlSeconds: number;
  acknowledgeOverlap: boolean;
};

export type RenewScopeReservationInput = {
  reservationId: string;
  runId: string;
  expectedVersion: number;
  ttlSeconds: number;
};

export type ReleaseScopeReservationInput = {
  reservationId: string;
  runId: string;
  expectedVersion: number;
  reason: string;
};

export type OverrideScopeReservationInput = {
  reservationId: string;
  expectedVersion: number;
  reason: string;
  confirmed: boolean;
};

export type ScopeReservationContext = {
  actorId: string;
  reservationId: string;
  auditId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
};

export type ScopeReservationAuditEvent = {
  id: string;
  actor: string;
  action:
    | "scope_reservation.acquire"
    | "scope_reservation.renew"
    | "scope_reservation.release"
    | "scope_reservation.override";
  entityType: "scope_reservation";
  entityId: string;
  before: ScopeReservationSnapshot | null;
  after: ScopeReservationSnapshot;
  reason: string;
  overlapReservationIds: readonly string[];
  occurredAt: string;
  source: "manual" | "agent";
  confirmed: boolean;
  idempotencyKey: string;
  correlationId: string;
};

export type ScopeReservationStoreResult =
  | "created"
  | "updated"
  | "duplicate"
  | "repository_not_found"
  | "run_not_found"
  | "conflict";

export interface ScopeReservationRepository {
  listPotentialOverlaps(
    repositoryId: string,
    branch: string,
    observedAt: string,
  ): Promise<readonly ScopeReservationSnapshot[]>;
  findById(id: string): Promise<ScopeReservationSnapshot | null>;
  acquire(
    reservation: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult>;
  update(
    before: ScopeReservationSnapshot,
    after: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult>;
}

export type ScopeReservationValidationError =
  | "ACTOR_ID_REQUIRED"
  | "RESERVATION_ID_REQUIRED"
  | "AUDIT_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "NOW_INVALID"
  | "PROJECT_ID_INVALID"
  | "REPOSITORY_ID_REQUIRED"
  | "RUN_ID_REQUIRED"
  | "BRANCH_INVALID"
  | "KIND_INVALID"
  | "SCOPE_PATTERN_REQUIRED"
  | "SCOPE_PATTERN_INVALID"
  | "HOLDER_LABEL_REQUIRED"
  | "HOLDER_LABEL_TOO_LONG"
  | "PURPOSE_REQUIRED"
  | "PURPOSE_TOO_LONG"
  | "TTL_INVALID"
  | "EXPECTED_VERSION_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED";

export type ScopeReservationResult =
  | {
      ok: true;
      reservation: ScopeReservationSnapshot;
      overlaps: readonly string[];
      audit: ScopeReservationAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly ScopeReservationValidationError[];
    }
  | {
      ok: false;
      code: "OVERLAP_CONFLICT";
      overlaps: readonly string[];
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "NOT_OWNER"
        | "STALE_STATE"
        | "EXPIRED"
        | "INACTIVE"
        | "DUPLICATE"
        | "REPOSITORY_NOT_FOUND"
        | "RUN_NOT_FOUND"
        | "CONFLICT";
    };

const reservationKinds = new Set<ScopeReservationKind>([
  "repository",
  "directory",
  "files",
  "issue",
  "stage",
  "custom",
]);
const idPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,199})$/u;
const branchCharacterPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const minimumTtlSeconds = 5 * 60;
const maximumTtlSeconds = 24 * 60 * 60;

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

function safeBranchName(value: string): boolean {
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

function validTtl(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= minimumTtlSeconds &&
    value <= maximumTtlSeconds
  );
}

function expiresAt(now: string, ttlSeconds: number): string {
  return new Date(Date.parse(now) + ttlSeconds * 1_000).toISOString();
}

function mapStoreFailure(result: ScopeReservationStoreResult): ScopeReservationResult {
  if (result === "duplicate") return { ok: false, code: "DUPLICATE" };
  if (result === "repository_not_found") {
    return { ok: false, code: "REPOSITORY_NOT_FOUND" };
  }
  if (result === "run_not_found") return { ok: false, code: "RUN_NOT_FOUND" };
  return { ok: false, code: "CONFLICT" };
}

function contextErrors(
  context: ScopeReservationContext,
): { errors: ScopeReservationValidationError[]; now: string | null } {
  const errors: ScopeReservationValidationError[] = [];
  if (text(context.actorId).length === 0) errors.push("ACTOR_ID_REQUIRED");
  if (text(context.reservationId).length === 0) {
    errors.push("RESERVATION_ID_REQUIRED");
  }
  if (text(context.auditId).length === 0) errors.push("AUDIT_ID_REQUIRED");
  if (text(context.idempotencyKey).length === 0) {
    errors.push("IDEMPOTENCY_KEY_REQUIRED");
  }
  if (text(context.correlationId).length === 0) {
    errors.push("CORRELATION_ID_REQUIRED");
  }
  const now = normalizedIso(context.now);
  if (now === null) errors.push("NOW_INVALID");
  return { errors, now };
}

function auditEvent(input: {
  context: ScopeReservationContext;
  action: ScopeReservationAuditEvent["action"];
  before: ScopeReservationSnapshot | null;
  after: ScopeReservationSnapshot;
  reason: string;
  overlaps?: readonly string[];
  confirmed?: boolean;
  source?: "manual" | "agent";
}): ScopeReservationAuditEvent {
  return {
    id: text(input.context.auditId),
    actor: text(input.context.actorId),
    action: input.action,
    entityType: "scope_reservation",
    entityId: input.after.id,
    before: input.before,
    after: input.after,
    reason: input.reason,
    overlapReservationIds: input.overlaps ?? [],
    occurredAt: normalizedIso(input.context.now) ?? input.context.now,
    source: input.source ?? "agent",
    confirmed: input.confirmed ?? false,
    idempotencyKey: text(input.context.idempotencyKey),
    correlationId: text(input.context.correlationId),
  };
}

export class ScopeReservationService {
  constructor(private readonly repository: ScopeReservationRepository) {}

  async acquire(
    input: AcquireScopeReservationInput,
    context: ScopeReservationContext,
  ): Promise<ScopeReservationResult> {
    const { errors, now } = contextErrors(context);
    const projectId = nullableText(input.projectId);
    const repositoryId = text(input.repositoryId);
    const runId = nullableText(input.runId);
    const branch = text(input.branch);
    const holderLabel = text(input.holderLabel);
    const purpose = text(input.purpose);
    const patterns = normalizeScopePatterns(input.patterns);

    if (projectId !== null && !idPattern.test(projectId)) {
      errors.push("PROJECT_ID_INVALID");
    }
    if (!idPattern.test(repositoryId)) errors.push("REPOSITORY_ID_REQUIRED");
    if (runId !== null && !idPattern.test(runId)) errors.push("RUN_ID_REQUIRED");
    if (!safeBranchName(branch)) errors.push("BRANCH_INVALID");
    if (!reservationKinds.has(input.kind)) errors.push("KIND_INVALID");
    if (!patterns.ok) errors.push(patterns.code);
    if (holderLabel.length === 0) errors.push("HOLDER_LABEL_REQUIRED");
    else if (holderLabel.length > 100) errors.push("HOLDER_LABEL_TOO_LONG");
    if (purpose.length === 0) errors.push("PURPOSE_REQUIRED");
    else if (purpose.length > 1_000) errors.push("PURPOSE_TOO_LONG");
    if (!validTtl(input.ttlSeconds)) errors.push("TTL_INVALID");

    if (errors.length > 0 || now === null || !patterns.ok) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const reservation: ScopeReservationSnapshot = {
      id: text(context.reservationId),
      projectId,
      repositoryId,
      runId,
      branch,
      kind: input.kind,
      patterns: patterns.patterns,
      holderLabel,
      purpose,
      state: "active",
      acquiredAt: now,
      renewedAt: now,
      expiresAt: expiresAt(now, input.ttlSeconds),
      releasedAt: null,
      version: 1,
    };

    const candidates = await this.repository.listPotentialOverlaps(
      repositoryId,
      branch,
      now,
    );
    const overlaps = candidates
      .filter((candidate) =>
        scopeReservationsOverlap(reservation, candidate, now).overlaps,
      )
      .map((candidate) => candidate.id)
      .sort((left, right) => left.localeCompare(right));

    if (overlaps.length > 0 && !input.acknowledgeOverlap) {
      return { ok: false, code: "OVERLAP_CONFLICT", overlaps };
    }

    const audit = auditEvent({
      context,
      action: "scope_reservation.acquire",
      before: null,
      after: reservation,
      reason: purpose,
      overlaps,
      confirmed: overlaps.length > 0 && input.acknowledgeOverlap,
    });
    const stored = await this.repository.acquire(reservation, audit);
    if (stored !== "created") return mapStoreFailure(stored);
    return { ok: true, reservation, overlaps, audit };
  }

  async renew(
    input: RenewScopeReservationInput,
    context: ScopeReservationContext,
  ): Promise<ScopeReservationResult> {
    const { errors, now } = contextErrors(context);
    const reservationId = text(input.reservationId);
    const runId = text(input.runId);
    if (!idPattern.test(reservationId)) errors.push("RESERVATION_ID_REQUIRED");
    if (!idPattern.test(runId)) errors.push("RUN_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (!validTtl(input.ttlSeconds)) errors.push("TTL_INVALID");
    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(reservationId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.runId !== runId) return { ok: false, code: "NOT_OWNER" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "STALE_STATE" };
    }
    const freshness = deriveScopeReservationFreshness(before, now);
    if (freshness.status === "expired") return { ok: false, code: "EXPIRED" };
    if (freshness.status !== "active") return { ok: false, code: "INACTIVE" };

    const after: ScopeReservationSnapshot = {
      ...before,
      renewedAt: now,
      expiresAt: expiresAt(now, input.ttlSeconds),
      version: before.version + 1,
    };
    const audit = auditEvent({
      context,
      action: "scope_reservation.renew",
      before,
      after,
      reason: "Renew active scope reservation.",
    });
    const stored = await this.repository.update(before, after, audit);
    if (stored !== "updated") return mapStoreFailure(stored);
    return { ok: true, reservation: after, overlaps: [], audit };
  }

  async release(
    input: ReleaseScopeReservationInput,
    context: ScopeReservationContext,
  ): Promise<ScopeReservationResult> {
    const { errors, now } = contextErrors(context);
    const reservationId = text(input.reservationId);
    const runId = text(input.runId);
    const reason = text(input.reason);
    if (!idPattern.test(reservationId)) errors.push("RESERVATION_ID_REQUIRED");
    if (!idPattern.test(runId)) errors.push("RUN_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 500) errors.push("REASON_TOO_LONG");
    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(reservationId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.runId !== runId) return { ok: false, code: "NOT_OWNER" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (before.state !== "active") return { ok: false, code: "INACTIVE" };

    const after: ScopeReservationSnapshot = {
      ...before,
      state: "released",
      releasedAt: now,
      version: before.version + 1,
    };
    const audit = auditEvent({
      context,
      action: "scope_reservation.release",
      before,
      after,
      reason,
    });
    const stored = await this.repository.update(before, after, audit);
    if (stored !== "updated") return mapStoreFailure(stored);
    return { ok: true, reservation: after, overlaps: [], audit };
  }

  async override(
    input: OverrideScopeReservationInput,
    context: ScopeReservationContext,
  ): Promise<ScopeReservationResult> {
    const { errors, now } = contextErrors(context);
    const reservationId = text(input.reservationId);
    const reason = text(input.reason);
    if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (!idPattern.test(reservationId)) errors.push("RESERVATION_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 500) errors.push("REASON_TOO_LONG");
    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(reservationId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (before.state !== "active") return { ok: false, code: "INACTIVE" };

    const after: ScopeReservationSnapshot = {
      ...before,
      state: "overridden",
      releasedAt: now,
      version: before.version + 1,
    };
    const audit = auditEvent({
      context,
      action: "scope_reservation.override",
      before,
      after,
      reason,
      confirmed: true,
      source: "manual",
    });
    const stored = await this.repository.update(before, after, audit);
    if (stored !== "updated") return mapStoreFailure(stored);
    return { ok: true, reservation: after, overlaps: [], audit };
  }
}
