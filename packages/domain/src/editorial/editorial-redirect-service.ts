import type {
  EditorialDocumentKind,
  EditorialPublicationStatus,
} from "./editorial-workflow";

export type EditorialRedirectAction = "created" | "revoked";

export type EditorialRedirectTargetSnapshot = {
  id: string;
  kind: EditorialDocumentKind;
  slug: string;
  publicationStatus: EditorialPublicationStatus;
  updatedAt: string;
};

export type EditorialRedirectEventSnapshot = {
  id: string;
  sourceSlug: string;
  kind: EditorialDocumentKind;
  targetDocumentId: string;
  sequence: number;
  action: EditorialRedirectAction;
  actor: string;
  reason: string;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EditorialRedirectEventDraft = Omit<
  EditorialRedirectEventSnapshot,
  "sequence"
>;

export type EditorialRedirectStoreResult =
  | { status: "created"; event: EditorialRedirectEventSnapshot }
  | { status: "duplicate"; event: EditorialRedirectEventSnapshot }
  | {
      status:
        | "conflict"
        | "source_canonical_conflict"
        | "target_not_found"
        | "target_not_published"
        | "target_kind_mismatch"
        | "redirect_already_active"
        | "redirect_not_active";
    };

export interface EditorialRedirectRepository {
  findReplay(idempotencyKey: string): Promise<EditorialRedirectEventSnapshot | null>;
  findCanonicalDocumentBySlug(
    slug: string,
  ): Promise<EditorialRedirectTargetSnapshot | null>;
  findTargetDocument(
    documentId: string,
  ): Promise<EditorialRedirectTargetSnapshot | null>;
  findLatestEvent(
    sourceSlug: string,
  ): Promise<EditorialRedirectEventSnapshot | null>;
  appendCreate(
    event: EditorialRedirectEventDraft,
    expectation: {
      expectedLatestEventId: string | null;
      expectedTargetUpdatedAt: string;
    },
  ): Promise<EditorialRedirectStoreResult>;
  appendRevoke(
    event: EditorialRedirectEventDraft,
    expectation: { expectedLatestEventId: string },
  ): Promise<EditorialRedirectStoreResult>;
}

export type EditorialRedirectContext = {
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
};

export type CreateEditorialRedirectRequest = {
  sourceSlug: string;
  kind: EditorialDocumentKind;
  targetDocumentId: string;
  reason: string;
  confirmed: boolean;
};

export type RevokeEditorialRedirectRequest = CreateEditorialRedirectRequest;

export type EditorialRedirectValidationError =
  | "ACTOR_REQUIRED"
  | "EVENT_ID_INVALID"
  | "IDEMPOTENCY_KEY_INVALID"
  | "CORRELATION_ID_INVALID"
  | "TIMESTAMP_INVALID"
  | "SOURCE_SLUG_INVALID"
  | "TARGET_DOCUMENT_ID_INVALID"
  | "KIND_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED";

export type EditorialRedirectResult =
  | {
      ok: true;
      event: EditorialRedirectEventSnapshot;
      duplicate: boolean;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly EditorialRedirectValidationError[];
    }
  | {
      ok: false;
      code:
        | "TARGET_NOT_FOUND"
        | "TARGET_NOT_PUBLISHED"
        | "TARGET_KIND_MISMATCH"
        | "SOURCE_CANONICAL_CONFLICT"
        | "SOURCE_MATCHES_TARGET"
        | "REDIRECT_ALREADY_ACTIVE"
        | "REDIRECT_NOT_ACTIVE"
        | "CONFLICT";
    };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/u;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const kinds = new Set<EditorialDocumentKind>([
  "project",
  "note",
  "experiment",
  "page",
]);

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function validate(
  request: CreateEditorialRedirectRequest,
  context: EditorialRedirectContext,
): {
  errors: EditorialRedirectValidationError[];
  sourceSlug: string;
  targetDocumentId: string;
  reason: string;
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string | null;
} {
  const errors: EditorialRedirectValidationError[] = [];
  const sourceSlug = request.sourceSlug.trim().toLowerCase();
  const targetDocumentId = request.targetDocumentId.trim();
  const reason = request.reason.trim();
  const actorId = context.actorId.trim();
  const eventId = context.eventId.trim();
  const idempotencyKey = context.idempotencyKey.trim();
  const correlationId = context.correlationId.trim();
  const now = normalizedIso(context.now);

  if (actorId.length === 0) errors.push("ACTOR_REQUIRED");
  if (!idPattern.test(eventId)) errors.push("EVENT_ID_INVALID");
  if (!idPattern.test(idempotencyKey)) errors.push("IDEMPOTENCY_KEY_INVALID");
  if (!idPattern.test(correlationId)) errors.push("CORRELATION_ID_INVALID");
  if (now === null) errors.push("TIMESTAMP_INVALID");
  if (!slugPattern.test(sourceSlug) || sourceSlug !== request.sourceSlug.trim()) {
    errors.push("SOURCE_SLUG_INVALID");
  }
  if (!idPattern.test(targetDocumentId)) {
    errors.push("TARGET_DOCUMENT_ID_INVALID");
  }
  if (!kinds.has(request.kind)) errors.push("KIND_INVALID");
  if (reason.length === 0) errors.push("REASON_REQUIRED");
  else if (reason.length > 2_000) errors.push("REASON_TOO_LONG");
  if (!request.confirmed) errors.push("CONFIRMATION_REQUIRED");

  return {
    errors,
    sourceSlug,
    targetDocumentId,
    reason,
    actorId,
    eventId,
    idempotencyKey,
    correlationId,
    now,
  };
}

function sameIntent(
  event: EditorialRedirectEventSnapshot,
  request: CreateEditorialRedirectRequest,
  context: EditorialRedirectContext,
  action: EditorialRedirectAction,
): boolean {
  return (
    event.id === context.eventId.trim() &&
    event.sourceSlug === request.sourceSlug.trim() &&
    event.kind === request.kind &&
    event.targetDocumentId === request.targetDocumentId.trim() &&
    event.action === action &&
    event.actor === context.actorId.trim() &&
    event.reason === request.reason.trim() &&
    event.idempotencyKey === context.idempotencyKey.trim() &&
    event.correlationId === context.correlationId.trim()
  );
}

function mapStoreResult(
  result: EditorialRedirectStoreResult,
  request: CreateEditorialRedirectRequest,
  context: EditorialRedirectContext,
  action: EditorialRedirectAction,
): EditorialRedirectResult {
  if (result.status === "created") {
    return { ok: true, event: result.event, duplicate: false };
  }
  if (result.status === "duplicate") {
    return sameIntent(result.event, request, context, action)
      ? { ok: true, event: result.event, duplicate: true }
      : { ok: false, code: "CONFLICT" };
  }
  if (result.status === "source_canonical_conflict") {
    return { ok: false, code: "SOURCE_CANONICAL_CONFLICT" };
  }
  if (result.status === "target_not_found") {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }
  if (result.status === "target_not_published") {
    return { ok: false, code: "TARGET_NOT_PUBLISHED" };
  }
  if (result.status === "target_kind_mismatch") {
    return { ok: false, code: "TARGET_KIND_MISMATCH" };
  }
  if (result.status === "redirect_already_active") {
    return { ok: false, code: "REDIRECT_ALREADY_ACTIVE" };
  }
  if (result.status === "redirect_not_active") {
    return { ok: false, code: "REDIRECT_NOT_ACTIVE" };
  }
  return { ok: false, code: "CONFLICT" };
}

function draft(
  request: CreateEditorialRedirectRequest,
  context: EditorialRedirectContext,
  resolved: ReturnType<typeof validate>,
  action: EditorialRedirectAction,
): EditorialRedirectEventDraft {
  return {
    id: resolved.eventId,
    sourceSlug: resolved.sourceSlug,
    kind: request.kind,
    targetDocumentId: resolved.targetDocumentId,
    action,
    actor: resolved.actorId,
    reason: resolved.reason,
    occurredAt: resolved.now as string,
    idempotencyKey: resolved.idempotencyKey,
    correlationId: resolved.correlationId,
  };
}

export class EditorialRedirectService {
  constructor(private readonly repository: EditorialRedirectRepository) {}

  async create(
    request: CreateEditorialRedirectRequest,
    context: EditorialRedirectContext,
  ): Promise<EditorialRedirectResult> {
    const resolved = validate(request, context);
    if (resolved.errors.length > 0 || resolved.now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors: resolved.errors };
    }

    const replay = await this.repository.findReplay(resolved.idempotencyKey);
    if (replay !== null) {
      return sameIntent(replay, request, context, "created")
        ? { ok: true, event: replay, duplicate: true }
        : { ok: false, code: "CONFLICT" };
    }

    const target = await this.repository.findTargetDocument(
      resolved.targetDocumentId,
    );
    if (target === null) return { ok: false, code: "TARGET_NOT_FOUND" };
    if (target.kind !== request.kind) {
      return { ok: false, code: "TARGET_KIND_MISMATCH" };
    }
    if (target.publicationStatus !== "published") {
      return { ok: false, code: "TARGET_NOT_PUBLISHED" };
    }
    if (resolved.sourceSlug === target.slug) {
      return { ok: false, code: "SOURCE_MATCHES_TARGET" };
    }

    const canonical = await this.repository.findCanonicalDocumentBySlug(
      resolved.sourceSlug,
    );
    if (canonical !== null) {
      return { ok: false, code: "SOURCE_CANONICAL_CONFLICT" };
    }

    const latest = await this.repository.findLatestEvent(resolved.sourceSlug);
    if (latest?.action === "created") {
      return { ok: false, code: "REDIRECT_ALREADY_ACTIVE" };
    }

    const stored = await this.repository.appendCreate(
      draft(request, context, resolved, "created"),
      {
        expectedLatestEventId: latest?.id ?? null,
        expectedTargetUpdatedAt: target.updatedAt,
      },
    );
    return mapStoreResult(stored, request, context, "created");
  }

  async revoke(
    request: RevokeEditorialRedirectRequest,
    context: EditorialRedirectContext,
  ): Promise<EditorialRedirectResult> {
    const resolved = validate(request, context);
    if (resolved.errors.length > 0 || resolved.now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors: resolved.errors };
    }

    const replay = await this.repository.findReplay(resolved.idempotencyKey);
    if (replay !== null) {
      return sameIntent(replay, request, context, "revoked")
        ? { ok: true, event: replay, duplicate: true }
        : { ok: false, code: "CONFLICT" };
    }

    const latest = await this.repository.findLatestEvent(resolved.sourceSlug);
    if (latest === null || latest.action !== "created") {
      return { ok: false, code: "REDIRECT_NOT_ACTIVE" };
    }
    if (
      latest.kind !== request.kind ||
      latest.targetDocumentId !== resolved.targetDocumentId
    ) {
      return { ok: false, code: "CONFLICT" };
    }

    const stored = await this.repository.appendRevoke(
      draft(request, context, resolved, "revoked"),
      { expectedLatestEventId: latest.id },
    );
    return mapStoreResult(stored, request, context, "revoked");
  }
}
