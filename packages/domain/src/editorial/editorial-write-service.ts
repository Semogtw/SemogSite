import {
  applyEditorialTransition,
  createEditorialDocument,
  createEditorialRevision,
  type EditorialApprovalSnapshot,
  type EditorialDocumentKind,
  type EditorialDocumentSnapshot,
  type EditorialEventKind,
  type EditorialRevisionSnapshot,
  type EditorialSensitiveReviewChecks,
  type EditorialValidationError,
} from "./editorial-workflow";

export type EditorialPersistenceEvent = {
  id: string;
  documentId: string;
  kind:
    | EditorialEventKind
    | "editorial.document_created"
    | "editorial.revision_created";
  actor: string;
  revisionId: string | null;
  summary: string;
  reason: string | null;
  before: EditorialDocumentSnapshot | null;
  after: EditorialDocumentSnapshot;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EditorialWriteStoreResult =
  | "created"
  | "updated"
  | "duplicate"
  | "conflict"
  | "slug_conflict";

export type EditorialPersistenceReplay = {
  event: EditorialPersistenceEvent;
  revision: EditorialRevisionSnapshot | null;
};

export interface EditorialWriteRepository {
  findReplay(
    documentId: string,
    idempotencyKey: string,
  ): Promise<EditorialPersistenceReplay | null>;
  findDocument(documentId: string): Promise<EditorialDocumentSnapshot | null>;
  findRevision(
    documentId: string,
    revisionId: string,
  ): Promise<EditorialRevisionSnapshot | null>;
  findApproval(
    documentId: string,
    revisionId: string,
    contentHash: string,
  ): Promise<EditorialApprovalSnapshot | null>;
  nextRevisionSequence(documentId: string): Promise<number>;
  createDocument(
    document: EditorialDocumentSnapshot,
    revision: EditorialRevisionSnapshot,
    event: EditorialPersistenceEvent,
  ): Promise<EditorialWriteStoreResult>;
  createRevision(
    before: EditorialDocumentSnapshot,
    after: EditorialDocumentSnapshot,
    revision: EditorialRevisionSnapshot,
    event: EditorialPersistenceEvent,
  ): Promise<EditorialWriteStoreResult>;
  applyTransition(
    before: EditorialDocumentSnapshot,
    after: EditorialDocumentSnapshot,
    event: EditorialPersistenceEvent,
    approval: EditorialApprovalSnapshot | null,
  ): Promise<EditorialWriteStoreResult>;
}

export type EditorialWriteContext = {
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
  expectedUpdatedAt?: string;
};

export type EditorialWriteValidationError =
  | EditorialValidationError
  | "EVENT_ID_INVALID"
  | "IDEMPOTENCY_KEY_INVALID"
  | "CORRELATION_ID_INVALID"
  | "DOCUMENT_ID_INVALID"
  | "REVISION_ID_INVALID"
  | "APPROVAL_ID_INVALID"
  | "EXPECTED_UPDATED_AT_REQUIRED"
  | "NEXT_REVISION_SEQUENCE_INVALID";

export type EditorialWriteResult =
  | {
      ok: true;
      document: EditorialDocumentSnapshot;
      revision?: EditorialRevisionSnapshot;
      approval?: EditorialApprovalSnapshot;
      duplicate: boolean;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly EditorialWriteValidationError[];
    }
  | {
      ok: false;
      code:
        | "DOCUMENT_NOT_FOUND"
        | "REVISION_NOT_FOUND"
        | "APPROVAL_NOT_FOUND"
        | "STALE_STATE"
        | "INVALID_TRANSITION"
        | "INVALID_CURRENT_STATE"
        | "SLUG_CONFLICT"
        | "CONFLICT";
    };

export type CreateEditorialDocumentRequest = {
  documentId: string;
  revisionId: string;
  kind: EditorialDocumentKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
};

export type CreateEditorialRevisionRequest = {
  documentId: string;
  revisionId: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
};

export type ApproveEditorialRequest = {
  documentId: string;
  revisionId: string;
  approvalId: string;
  reason: string;
  notes: string | null;
  checks: EditorialSensitiveReviewChecks;
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/u;

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function validateContext(
  context: EditorialWriteContext,
  options: {
    documentId?: string;
    revisionId?: string;
    approvalId?: string;
    requireExpectedUpdatedAt: boolean;
  },
): {
  errors: EditorialWriteValidationError[];
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string | null;
  expectedUpdatedAt: string | null;
  documentId: string | null;
  revisionId: string | null;
  approvalId: string | null;
} {
  const errors: EditorialWriteValidationError[] = [];
  const actorId = context.actorId.trim();
  const eventId = context.eventId.trim();
  const idempotencyKey = context.idempotencyKey.trim();
  const correlationId = context.correlationId.trim();
  const now = normalizedIso(context.now);
  const expectedUpdatedAt =
    context.expectedUpdatedAt === undefined
      ? null
      : normalizedIso(context.expectedUpdatedAt);
  const documentId =
    options.documentId === undefined ? null : options.documentId.trim();
  const revisionId =
    options.revisionId === undefined ? null : options.revisionId.trim();
  const approvalId =
    options.approvalId === undefined ? null : options.approvalId.trim();

  if (actorId.length === 0) errors.push("ACTOR_REQUIRED");
  if (!idPattern.test(eventId)) errors.push("EVENT_ID_INVALID");
  if (!idempotencyPattern.test(idempotencyKey)) {
    errors.push("IDEMPOTENCY_KEY_INVALID");
  }
  if (!idempotencyPattern.test(correlationId)) {
    errors.push("CORRELATION_ID_INVALID");
  }
  if (now === null) errors.push("TIMESTAMP_INVALID");
  if (options.requireExpectedUpdatedAt && expectedUpdatedAt === null) {
    errors.push("EXPECTED_UPDATED_AT_REQUIRED");
  }
  if (documentId !== null && !idPattern.test(documentId)) {
    errors.push("DOCUMENT_ID_INVALID");
  }
  if (revisionId !== null && !idPattern.test(revisionId)) {
    errors.push("REVISION_ID_INVALID");
  }
  if (approvalId !== null && !idPattern.test(approvalId)) {
    errors.push("APPROVAL_ID_INVALID");
  }

  return {
    errors,
    actorId,
    eventId,
    idempotencyKey,
    correlationId,
    now,
    expectedUpdatedAt,
    documentId,
    revisionId,
    approvalId,
  };
}

function mapStoreResult(
  storeResult: EditorialWriteStoreResult,
  success: Omit<Extract<EditorialWriteResult, { ok: true }>, "duplicate">,
): EditorialWriteResult {
  if (storeResult === "created" || storeResult === "updated") {
    return { ...success, duplicate: false };
  }
  if (storeResult === "duplicate") {
    return { ...success, duplicate: true };
  }
  if (storeResult === "slug_conflict") {
    return { ok: false, code: "SLUG_CONFLICT" };
  }
  return { ok: false, code: "CONFLICT" };
}

function persistenceEvent(input: {
  context: ReturnType<typeof validateContext>;
  documentId: string;
  kind: EditorialPersistenceEvent["kind"];
  revisionId: string | null;
  summary: string;
  reason?: string | null;
  before: EditorialDocumentSnapshot | null;
  after: EditorialDocumentSnapshot;
}): EditorialPersistenceEvent {
  return {
    id: input.context.eventId,
    documentId: input.documentId,
    kind: input.kind,
    actor: input.context.actorId,
    revisionId: input.revisionId,
    summary: input.summary,
    reason: input.reason ?? null,
    before: input.before,
    after: input.after,
    occurredAt: input.context.now as string,
    idempotencyKey: input.context.idempotencyKey,
    correlationId: input.context.correlationId,
  };
}

function transitionFailure(
  result: Exclude<
    ReturnType<typeof applyEditorialTransition>,
    { ok: true }
  >,
): EditorialWriteResult {
  if (result.code === "VALIDATION_FAILED") {
    return { ok: false, code: result.code, errors: result.errors };
  }
  return { ok: false, code: result.code };
}

export class EditorialWriteService {
  constructor(private readonly repository: EditorialWriteRepository) {}

  async createDocument(
    input: CreateEditorialDocumentRequest,
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    const resolved = validateContext(context, {
      documentId: input.documentId,
      revisionId: input.revisionId,
      requireExpectedUpdatedAt: false,
    });
    if (resolved.errors.length > 0 || resolved.now === null) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: resolved.errors,
      };
    }

    const created = createEditorialDocument(
      {
        id: resolved.documentId as string,
        revisionId: resolved.revisionId as string,
        kind: input.kind,
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        bodyMarkdown: input.bodyMarkdown,
        tags: input.tags,
        contentHash: input.contentHash,
      },
      { actorId: resolved.actorId, now: resolved.now },
    );
    if (!created.ok) {
      return { ok: false, code: created.code, errors: created.errors };
    }

    const event = persistenceEvent({
      context: resolved,
      documentId: created.document.id,
      kind: "editorial.document_created",
      revisionId: null,
      summary: "Editorial document and first revision created.",
      before: null,
      after: created.document,
    });
    const stored = await this.repository.createDocument(
      created.document,
      created.revision,
      event,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: created.document,
      revision: created.revision,
    });
  }

  async createRevision(
    input: CreateEditorialRevisionRequest,
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    const resolved = validateContext(context, {
      documentId: input.documentId,
      revisionId: input.revisionId,
      requireExpectedUpdatedAt: true,
    });
    if (
      resolved.errors.length > 0 ||
      resolved.now === null ||
      resolved.expectedUpdatedAt === null
    ) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: resolved.errors,
      };
    }

    const replay = await this.repository.findReplay(
      resolved.documentId as string,
      resolved.idempotencyKey,
    );
    if (replay !== null) {
      if (replay.event.before === null || replay.revision === null) {
        return { ok: false, code: "CONFLICT" };
      }
      const replayed = createEditorialRevision(
        replay.event.before,
        {
          revisionId: resolved.revisionId as string,
          title: input.title,
          excerpt: input.excerpt,
          bodyMarkdown: input.bodyMarkdown,
          tags: input.tags,
          contentHash: input.contentHash,
        },
        {
          actorId: resolved.actorId,
          expectedUpdatedAt: resolved.expectedUpdatedAt,
          now: resolved.now,
        },
      );
      if (!replayed.ok) return { ok: false, code: "CONFLICT" };
      const revision = {
        ...replayed.revision,
        sequence: replay.revision.sequence,
      };
      const event = persistenceEvent({
        context: resolved,
        documentId: replay.event.before.id,
        kind: "editorial.revision_created",
        revisionId: revision.id,
        summary: `Editorial revision ${revision.id} created.`,
        before: replay.event.before,
        after: replayed.document,
      });
      return JSON.stringify(revision) === JSON.stringify(replay.revision) &&
        JSON.stringify(event) === JSON.stringify(replay.event)
        ? {
            ok: true,
            document: replay.event.after,
            revision: replay.revision,
            duplicate: true,
          }
        : { ok: false, code: "CONFLICT" };
    }

    const current = await this.repository.findDocument(
      resolved.documentId as string,
    );
    if (current === null) return { ok: false, code: "DOCUMENT_NOT_FOUND" };

    const created = createEditorialRevision(
      current,
      {
        revisionId: resolved.revisionId as string,
        title: input.title,
        excerpt: input.excerpt,
        bodyMarkdown: input.bodyMarkdown,
        tags: input.tags,
        contentHash: input.contentHash,
      },
      {
        actorId: resolved.actorId,
        expectedUpdatedAt: resolved.expectedUpdatedAt,
        now: resolved.now,
      },
    );
    if (!created.ok) {
      if (created.code === "VALIDATION_FAILED") {
        return { ok: false, code: created.code, errors: created.errors };
      }
      return { ok: false, code: created.code };
    }

    const sequence = await this.repository.nextRevisionSequence(current.id);
    if (!Number.isInteger(sequence) || sequence < 2) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["NEXT_REVISION_SEQUENCE_INVALID"],
      };
    }
    const revision = { ...created.revision, sequence };
    const event = persistenceEvent({
      context: resolved,
      documentId: current.id,
      kind: "editorial.revision_created",
      revisionId: revision.id,
      summary: `Editorial revision ${revision.id} created.`,
      before: current,
      after: created.document,
    });
    const stored = await this.repository.createRevision(
      current,
      created.document,
      revision,
      event,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: created.document,
      revision,
    });
  }

  async submitForReview(
    input: { documentId: string },
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    return this.transitionWithWorkingRevision(
      input.documentId,
      context,
      "submit_for_review",
    );
  }

  async reopenDraft(
    input: { documentId: string; reason: string },
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    return this.transitionWithWorkingRevision(
      input.documentId,
      context,
      "reopen_draft",
      input.reason,
    );
  }

  async approve(
    input: ApproveEditorialRequest,
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    const loaded = await this.loadTransitionEntities(
      input.documentId,
      input.revisionId,
      input.approvalId,
      context,
    );
    if (!loaded.ok) return loaded.result;

    const approval: EditorialApprovalSnapshot = {
      id: loaded.context.approvalId as string,
      documentId: loaded.document.id,
      revisionId: loaded.revision.id,
      contentHash: loaded.revision.contentHash,
      reviewerId: loaded.context.actorId,
      reason: input.reason.trim(),
      notes: input.notes === null ? null : input.notes.trim(),
      checks: { ...input.checks },
      reviewedAt: loaded.context.now as string,
    };
    const transition = applyEditorialTransition(
      loaded.document,
      { kind: "approve", revision: loaded.revision, approval },
      {
        actorId: loaded.context.actorId,
        eventId: loaded.context.eventId,
        idempotencyKey: loaded.context.idempotencyKey,
        correlationId: loaded.context.correlationId,
        expectedUpdatedAt: loaded.context.expectedUpdatedAt as string,
        now: loaded.context.now as string,
      },
    );
    if (!transition.ok) return transitionFailure(transition);

    const event = persistenceEvent({
      context: loaded.context,
      documentId: loaded.document.id,
      kind: transition.event.kind,
      revisionId: loaded.revision.id,
      summary: transition.event.summary,
      before: loaded.document,
      after: transition.document,
    });
    const stored = await this.repository.applyTransition(
      loaded.document,
      transition.document,
      event,
      approval,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: transition.document,
      approval,
    });
  }

  async publish(
    input: { documentId: string; revisionId: string },
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    return this.publishExistingApproval(
      input.documentId,
      input.revisionId,
      context,
      "publish",
      null,
    );
  }

  async withdraw(
    input: { documentId: string; reason: string },
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    const resolved = validateContext(context, {
      documentId: input.documentId,
      requireExpectedUpdatedAt: true,
    });
    if (
      resolved.errors.length > 0 ||
      resolved.now === null ||
      resolved.expectedUpdatedAt === null
    ) {
      return { ok: false, code: "VALIDATION_FAILED", errors: resolved.errors };
    }
    const current = await this.repository.findDocument(
      resolved.documentId as string,
    );
    if (current === null) return { ok: false, code: "DOCUMENT_NOT_FOUND" };

    const transition = applyEditorialTransition(
      current,
      { kind: "withdraw", reason: input.reason },
      {
        actorId: resolved.actorId,
        eventId: resolved.eventId,
        idempotencyKey: resolved.idempotencyKey,
        correlationId: resolved.correlationId,
        expectedUpdatedAt: resolved.expectedUpdatedAt,
        now: resolved.now,
      },
    );
    if (!transition.ok) return transitionFailure(transition);
    const event = persistenceEvent({
      context: resolved,
      documentId: current.id,
      kind: transition.event.kind,
      revisionId: null,
      summary: transition.event.summary,
      reason: input.reason.trim(),
      before: current,
      after: transition.document,
    });
    const stored = await this.repository.applyTransition(
      current,
      transition.document,
      event,
      null,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: transition.document,
    });
  }

  async rollback(
    input: { documentId: string; revisionId: string; reason: string },
    context: EditorialWriteContext,
  ): Promise<EditorialWriteResult> {
    return this.publishExistingApproval(
      input.documentId,
      input.revisionId,
      context,
      "rollback",
      input.reason,
    );
  }

  private async transitionWithWorkingRevision(
    documentId: string,
    context: EditorialWriteContext,
    kind: "submit_for_review" | "reopen_draft",
    reason?: string,
  ): Promise<EditorialWriteResult> {
    const resolved = validateContext(context, {
      documentId,
      requireExpectedUpdatedAt: true,
    });
    if (
      resolved.errors.length > 0 ||
      resolved.now === null ||
      resolved.expectedUpdatedAt === null
    ) {
      return { ok: false, code: "VALIDATION_FAILED", errors: resolved.errors };
    }
    const replay = await this.repository.findReplay(
      resolved.documentId as string,
      resolved.idempotencyKey,
    );
    if (replay !== null) {
      if (replay.event.before === null || replay.revision === null) {
        return { ok: false, code: "CONFLICT" };
      }
      const replayed = applyEditorialTransition(
        replay.event.before,
        kind === "submit_for_review"
          ? { kind, revision: replay.revision }
          : { kind, revision: replay.revision, reason: reason ?? "" },
        {
          actorId: resolved.actorId,
          eventId: resolved.eventId,
          idempotencyKey: resolved.idempotencyKey,
          correlationId: resolved.correlationId,
          expectedUpdatedAt: resolved.expectedUpdatedAt,
          now: resolved.now,
        },
      );
      if (!replayed.ok) return { ok: false, code: "CONFLICT" };
      const event = persistenceEvent({
        context: resolved,
        documentId: replay.event.before.id,
        kind: replayed.event.kind,
        revisionId: replay.revision.id,
        summary: replayed.event.summary,
        reason: reason?.trim() ?? null,
        before: replay.event.before,
        after: replayed.document,
      });
      return JSON.stringify(event) === JSON.stringify(replay.event)
        ? {
            ok: true,
            document: replay.event.after,
            revision: replay.revision,
            duplicate: true,
          }
        : { ok: false, code: "CONFLICT" };
    }

    const current = await this.repository.findDocument(
      resolved.documentId as string,
    );
    if (current === null) return { ok: false, code: "DOCUMENT_NOT_FOUND" };
    const revision = await this.repository.findRevision(
      current.id,
      current.workingRevisionId,
    );
    if (revision === null) return { ok: false, code: "REVISION_NOT_FOUND" };

    const transition = applyEditorialTransition(
      current,
      kind === "submit_for_review"
        ? { kind, revision }
        : { kind, revision, reason: reason ?? "" },
      {
        actorId: resolved.actorId,
        eventId: resolved.eventId,
        idempotencyKey: resolved.idempotencyKey,
        correlationId: resolved.correlationId,
        expectedUpdatedAt: resolved.expectedUpdatedAt,
        now: resolved.now,
      },
    );
    if (!transition.ok) return transitionFailure(transition);
    const event = persistenceEvent({
      context: resolved,
      documentId: current.id,
      kind: transition.event.kind,
      revisionId: revision.id,
      summary: transition.event.summary,
      reason: reason?.trim() ?? null,
      before: current,
      after: transition.document,
    });
    const stored = await this.repository.applyTransition(
      current,
      transition.document,
      event,
      null,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: transition.document,
      revision,
    });
  }

  private async loadTransitionEntities(
    documentId: string,
    revisionId: string,
    approvalId: string,
    context: EditorialWriteContext,
  ): Promise<
    | {
        ok: true;
        context: ReturnType<typeof validateContext>;
        document: EditorialDocumentSnapshot;
        revision: EditorialRevisionSnapshot;
      }
    | { ok: false; result: EditorialWriteResult }
  > {
    const resolved = validateContext(context, {
      documentId,
      revisionId,
      approvalId,
      requireExpectedUpdatedAt: true,
    });
    if (
      resolved.errors.length > 0 ||
      resolved.now === null ||
      resolved.expectedUpdatedAt === null
    ) {
      return {
        ok: false,
        result: { ok: false, code: "VALIDATION_FAILED", errors: resolved.errors },
      };
    }
    const document = await this.repository.findDocument(
      resolved.documentId as string,
    );
    if (document === null) {
      return { ok: false, result: { ok: false, code: "DOCUMENT_NOT_FOUND" } };
    }
    const revision = await this.repository.findRevision(
      document.id,
      resolved.revisionId as string,
    );
    if (revision === null) {
      return { ok: false, result: { ok: false, code: "REVISION_NOT_FOUND" } };
    }
    return { ok: true, context: resolved, document, revision };
  }

  private async publishExistingApproval(
    documentId: string,
    revisionId: string,
    context: EditorialWriteContext,
    kind: "publish" | "rollback",
    reason: string | null,
  ): Promise<EditorialWriteResult> {
    const loaded = await this.loadTransitionEntities(
      documentId,
      revisionId,
      `lookup-${revisionId}`,
      context,
    );
    if (!loaded.ok) {
      if (
        loaded.result.ok === false &&
        loaded.result.code === "VALIDATION_FAILED"
      ) {
        const errors = loaded.result.errors.filter(
          (error) => error !== "APPROVAL_ID_INVALID",
        );
        if (errors.length > 0) return { ...loaded.result, errors };
      }
      return loaded.result;
    }
    const approval = await this.repository.findApproval(
      loaded.document.id,
      loaded.revision.id,
      loaded.revision.contentHash,
    );
    if (approval === null) return { ok: false, code: "APPROVAL_NOT_FOUND" };

    const transition = applyEditorialTransition(
      loaded.document,
      kind === "publish"
        ? { kind, revision: loaded.revision, approval }
        : {
            kind,
            revision: loaded.revision,
            approval,
            reason: reason ?? "",
          },
      {
        actorId: loaded.context.actorId,
        eventId: loaded.context.eventId,
        idempotencyKey: loaded.context.idempotencyKey,
        correlationId: loaded.context.correlationId,
        expectedUpdatedAt: loaded.context.expectedUpdatedAt as string,
        now: loaded.context.now as string,
      },
    );
    if (!transition.ok) return transitionFailure(transition);
    const event = persistenceEvent({
      context: loaded.context,
      documentId: loaded.document.id,
      kind: transition.event.kind,
      revisionId: loaded.revision.id,
      summary: transition.event.summary,
      reason: reason?.trim() ?? null,
      before: loaded.document,
      after: transition.document,
    });
    const stored = await this.repository.applyTransition(
      loaded.document,
      transition.document,
      event,
      null,
    );
    return mapStoreResult(stored, {
      ok: true,
      document: transition.document,
      revision: loaded.revision,
      approval,
    });
  }
}
