export type EditorialDocumentKind = "project" | "note" | "experiment" | "page";
export type EditorialWorkflowStatus = "draft" | "in_review" | "approved";
export type EditorialPublicationStatus =
  | "unpublished"
  | "published"
  | "withdrawn";

export type EditorialDocumentSnapshot = {
  id: string;
  kind: EditorialDocumentKind;
  slug: string;
  workflowStatus: EditorialWorkflowStatus;
  publicationStatus: EditorialPublicationStatus;
  workingRevisionId: string;
  approvedRevisionId: string | null;
  publishedRevisionId: string | null;
  lastPublishedRevisionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EditorialRevisionSnapshot = {
  id: string;
  documentId: string;
  sequence: number;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
  createdBy: string;
  createdAt: string;
};

export type EditorialSensitiveReviewChecks = {
  credentials: boolean;
  personalData: boolean;
  operationalMetadata: boolean;
  externalLinks: boolean;
  legalAttribution: boolean;
  factualClaims: boolean;
  markdownSafety: boolean;
};

export type EditorialApprovalSnapshot = {
  id: string;
  documentId: string;
  revisionId: string;
  contentHash: string;
  reviewerId: string;
  reason: string;
  notes: string | null;
  checks: EditorialSensitiveReviewChecks;
  reviewedAt: string;
};

export type EditorialPublicProjection = {
  kind: EditorialDocumentKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
  publishedRevisionId: string;
  updatedAt: string;
};

export type EditorialEventKind =
  | "editorial.submitted_for_review"
  | "editorial.reopened_as_draft"
  | "editorial.approved"
  | "editorial.published"
  | "editorial.withdrawn"
  | "editorial.rolled_back";

export type EditorialEventProposal = {
  id: string;
  documentId: string;
  kind: EditorialEventKind;
  actor: string;
  summary: string;
  before: EditorialDocumentSnapshot;
  after: EditorialDocumentSnapshot;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EditorialTransitionContext = {
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  expectedUpdatedAt: string;
  now: string;
};

export type EditorialTransitionCommand =
  | {
      kind: "submit_for_review";
      revision: EditorialRevisionSnapshot;
    }
  | {
      kind: "reopen_draft";
      revision: EditorialRevisionSnapshot;
      reason: string;
    }
  | {
      kind: "approve";
      revision: EditorialRevisionSnapshot;
      approval: EditorialApprovalSnapshot;
    }
  | {
      kind: "publish";
      revision: EditorialRevisionSnapshot;
      approval: EditorialApprovalSnapshot;
    }
  | {
      kind: "withdraw";
      reason: string;
    }
  | {
      kind: "rollback";
      revision: EditorialRevisionSnapshot;
      approval: EditorialApprovalSnapshot;
      reason: string;
    };

export type EditorialValidationError =
  | "ID_REQUIRED"
  | "ID_INVALID"
  | "KIND_INVALID"
  | "SLUG_INVALID"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "EXCERPT_REQUIRED"
  | "EXCERPT_TOO_LONG"
  | "BODY_REQUIRED"
  | "BODY_TOO_LONG"
  | "RAW_HTML_FORBIDDEN"
  | "TAGS_TOO_MANY"
  | "TAG_INVALID"
  | "CONTENT_HASH_INVALID"
  | "ACTOR_REQUIRED"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_BEFORE_CURRENT"
  | "VERSION_INVALID"
  | "WORKING_REVISION_MISMATCH"
  | "REVISION_DOCUMENT_MISMATCH"
  | "APPROVAL_DOCUMENT_MISMATCH"
  | "APPROVAL_REVISION_MISMATCH"
  | "APPROVAL_CONTENT_HASH_MISMATCH"
  | "REVIEW_CHECKS_INCOMPLETE"
  | "APPROVAL_REASON_REQUIRED"
  | "APPROVAL_REASON_TOO_LONG"
  | "APPROVAL_NOTES_TOO_LONG"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type EditorialCreationResult =
  | {
      ok: true;
      document: EditorialDocumentSnapshot;
      revision: EditorialRevisionSnapshot;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly EditorialValidationError[];
    };

export type EditorialRevisionCreationResult =
  | {
      ok: true;
      document: EditorialDocumentSnapshot;
      revision: EditorialRevisionSnapshot;
    }
  | { ok: false; code: "STALE_STATE" }
  | { ok: false; code: "INVALID_CURRENT_STATE" }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly EditorialValidationError[];
    };

export type EditorialTransitionResult =
  | {
      ok: true;
      document: EditorialDocumentSnapshot;
      event: EditorialEventProposal;
    }
  | { ok: false; code: "STALE_STATE" }
  | { ok: false; code: "INVALID_TRANSITION" }
  | { ok: false; code: "INVALID_CURRENT_STATE" }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly EditorialValidationError[];
    };

export type CreateEditorialDocumentInput = {
  id: string;
  revisionId: string;
  kind: EditorialDocumentKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
};

export type CreateEditorialDocumentContext = {
  actorId: string;
  now: string;
};

export type CreateEditorialRevisionInput = {
  revisionId: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
};

export type CreateEditorialRevisionContext = {
  actorId: string;
  expectedUpdatedAt: string;
  now: string;
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const tagPattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const rawHtmlPattern = /<\/?[a-z][^>]*>/iu;
const documentKinds = new Set<EditorialDocumentKind>([
  "project",
  "note",
  "experiment",
  "page",
]);

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function normalizedId(value: string): string {
  return value.trim();
}

function normalizeTags(values: readonly string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function validateText(
  value: string,
  required: EditorialValidationError,
  tooLong: EditorialValidationError,
  maximum: number,
  errors: EditorialValidationError[],
): string {
  const normalized = value.trim();
  if (normalized.length === 0) errors.push(required);
  else if (normalized.length > maximum) errors.push(tooLong);
  return normalized;
}

function validateRevisionContent(input: {
  revisionId: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
}): {
  errors: EditorialValidationError[];
  revisionId: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: string[];
  contentHash: string;
} {
  const errors: EditorialValidationError[] = [];
  const revisionId = normalizedId(input.revisionId);
  if (revisionId.length === 0) errors.push("ID_REQUIRED");
  else if (!idPattern.test(revisionId)) errors.push("ID_INVALID");

  const title = validateText(
    input.title,
    "TITLE_REQUIRED",
    "TITLE_TOO_LONG",
    160,
    errors,
  );
  const excerpt = validateText(
    input.excerpt,
    "EXCERPT_REQUIRED",
    "EXCERPT_TOO_LONG",
    320,
    errors,
  );
  const bodyMarkdown = validateText(
    input.bodyMarkdown,
    "BODY_REQUIRED",
    "BODY_TOO_LONG",
    100_000,
    errors,
  );
  if (rawHtmlPattern.test(bodyMarkdown)) errors.push("RAW_HTML_FORBIDDEN");

  if (input.tags.length > 12) errors.push("TAGS_TOO_MANY");
  const tags = normalizeTags(input.tags);
  if (tags.some((tag) => !tagPattern.test(tag))) errors.push("TAG_INVALID");

  const contentHash = input.contentHash.trim().toLowerCase();
  if (!sha256Pattern.test(contentHash)) errors.push("CONTENT_HASH_INVALID");

  return {
    errors,
    revisionId,
    title,
    excerpt,
    bodyMarkdown,
    tags,
    contentHash,
  };
}

function validateDocumentState(
  document: EditorialDocumentSnapshot,
): EditorialValidationError[] {
  const errors: EditorialValidationError[] = [];
  if (!idPattern.test(document.id) || !idPattern.test(document.workingRevisionId)) {
    errors.push("ID_INVALID");
  }
  if (!documentKinds.has(document.kind)) errors.push("KIND_INVALID");
  if (!slugPattern.test(document.slug)) errors.push("SLUG_INVALID");
  if (!Number.isInteger(document.version) || document.version < 1) {
    errors.push("VERSION_INVALID");
  }
  if (
    normalizedIso(document.createdAt) === null ||
    normalizedIso(document.updatedAt) === null
  ) {
    errors.push("TIMESTAMP_INVALID");
  }
  if (
    document.workflowStatus === "approved" &&
    document.approvedRevisionId !== document.workingRevisionId
  ) {
    errors.push("WORKING_REVISION_MISMATCH");
  }
  if (
    document.publicationStatus === "published" &&
    document.publishedRevisionId === null
  ) {
    errors.push("WORKING_REVISION_MISMATCH");
  }
  if (
    document.publicationStatus !== "published" &&
    document.publishedRevisionId !== null
  ) {
    errors.push("WORKING_REVISION_MISMATCH");
  }
  return errors;
}

function validateActorAndTime(
  actorIdValue: string,
  nowValue: string,
): {
  actorId: string;
  now: string | null;
  errors: EditorialValidationError[];
} {
  const errors: EditorialValidationError[] = [];
  const actorId = actorIdValue.trim();
  if (actorId.length === 0) errors.push("ACTOR_REQUIRED");
  const now = normalizedIso(nowValue);
  if (now === null) errors.push("TIMESTAMP_INVALID");
  return { actorId, now, errors };
}

function revisionMatchesDocument(
  document: EditorialDocumentSnapshot,
  revision: EditorialRevisionSnapshot,
): EditorialValidationError[] {
  const errors: EditorialValidationError[] = [];
  if (revision.documentId !== document.id) {
    errors.push("REVISION_DOCUMENT_MISMATCH");
  }
  if (revision.id !== document.workingRevisionId) {
    errors.push("WORKING_REVISION_MISMATCH");
  }
  return errors;
}

function validateReason(value: string): EditorialValidationError[] {
  const normalized = value.trim();
  if (normalized.length === 0) return ["REASON_REQUIRED"];
  if (normalized.length > 2_000) return ["REASON_TOO_LONG"];
  return [];
}

function validateApproval(
  document: EditorialDocumentSnapshot,
  revision: EditorialRevisionSnapshot,
  approval: EditorialApprovalSnapshot,
): EditorialValidationError[] {
  const errors: EditorialValidationError[] = [];
  if (approval.documentId !== document.id) {
    errors.push("APPROVAL_DOCUMENT_MISMATCH");
  }
  if (approval.revisionId !== revision.id) {
    errors.push("APPROVAL_REVISION_MISMATCH");
  }
  if (approval.contentHash !== revision.contentHash) {
    errors.push("APPROVAL_CONTENT_HASH_MISMATCH");
  }
  if (!Object.values(approval.checks).every((value) => value === true)) {
    errors.push("REVIEW_CHECKS_INCOMPLETE");
  }
  const reason = approval.reason.trim();
  if (reason.length === 0) errors.push("APPROVAL_REASON_REQUIRED");
  else if (reason.length > 2_000) errors.push("APPROVAL_REASON_TOO_LONG");
  if (approval.notes !== null && approval.notes.trim().length > 4_000) {
    errors.push("APPROVAL_NOTES_TOO_LONG");
  }
  if (
    approval.reviewerId.trim().length === 0 ||
    normalizedIso(approval.reviewedAt) === null
  ) {
    errors.push("TIMESTAMP_INVALID");
  }
  return errors;
}

function transitionContextState(
  document: EditorialDocumentSnapshot,
  context: EditorialTransitionContext,
):
  | { ok: true; actorId: string; now: string }
  | { ok: false; result: EditorialTransitionResult } {
  const stateErrors = validateDocumentState(document);
  if (stateErrors.length > 0) {
    return { ok: false, result: { ok: false, code: "INVALID_CURRENT_STATE" } };
  }

  const expected = normalizedIso(context.expectedUpdatedAt);
  const current = normalizedIso(document.updatedAt);
  if (expected === null || current === null || expected !== current) {
    return { ok: false, result: { ok: false, code: "STALE_STATE" } };
  }

  const actorAndTime = validateActorAndTime(context.actorId, context.now);
  if (actorAndTime.errors.length > 0 || actorAndTime.now === null) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: actorAndTime.errors,
      },
    };
  }
  if (Date.parse(actorAndTime.now) < Date.parse(current)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["TIMESTAMP_BEFORE_CURRENT"],
      },
    };
  }

  return { ok: true, actorId: actorAndTime.actorId, now: actorAndTime.now };
}

function eventSummary(
  kind: EditorialEventKind,
  command: EditorialTransitionCommand,
): string {
  if (kind === "editorial.submitted_for_review") {
    return `Revision ${command.kind === "submit_for_review" ? command.revision.id : "unknown"} submitted for review.`;
  }
  if (kind === "editorial.approved") {
    return `Revision ${command.kind === "approve" ? command.revision.id : "unknown"} approved.`;
  }
  if (kind === "editorial.published") {
    return `Revision ${command.kind === "publish" ? command.revision.id : "unknown"} published.`;
  }
  if (kind === "editorial.rolled_back") {
    return `Publication rolled back to revision ${command.kind === "rollback" ? command.revision.id : "unknown"}.`;
  }
  if (kind === "editorial.withdrawn") return "Editorial publication withdrawn.";
  return "Editorial revision reopened as draft.";
}

function successTransition(
  before: EditorialDocumentSnapshot,
  after: EditorialDocumentSnapshot,
  kind: EditorialEventKind,
  command: EditorialTransitionCommand,
  context: EditorialTransitionContext,
  actorId: string,
  now: string,
): EditorialTransitionResult {
  return {
    ok: true,
    document: after,
    event: {
      id: context.eventId.trim(),
      documentId: before.id,
      kind,
      actor: actorId,
      summary: eventSummary(kind, command),
      before,
      after,
      occurredAt: now,
      idempotencyKey: context.idempotencyKey.trim(),
      correlationId: context.correlationId.trim(),
    },
  };
}

export function createEditorialDocument(
  input: CreateEditorialDocumentInput,
  context: CreateEditorialDocumentContext,
): EditorialCreationResult {
  const errors: EditorialValidationError[] = [];
  const id = normalizedId(input.id);
  if (id.length === 0) errors.push("ID_REQUIRED");
  else if (!idPattern.test(id)) errors.push("ID_INVALID");

  if (!documentKinds.has(input.kind)) errors.push("KIND_INVALID");
  const slug = input.slug.trim().toLowerCase();
  if (!slugPattern.test(slug)) errors.push("SLUG_INVALID");

  const revisionInput = validateRevisionContent(input);
  errors.push(...revisionInput.errors);
  const actorAndTime = validateActorAndTime(context.actorId, context.now);
  errors.push(...actorAndTime.errors);

  if (errors.length > 0 || actorAndTime.now === null) {
    return { ok: false, code: "VALIDATION_FAILED", errors: [...new Set(errors)] };
  }

  const revision: EditorialRevisionSnapshot = {
    id: revisionInput.revisionId,
    documentId: id,
    sequence: 1,
    title: revisionInput.title,
    excerpt: revisionInput.excerpt,
    bodyMarkdown: revisionInput.bodyMarkdown,
    tags: revisionInput.tags,
    contentHash: revisionInput.contentHash,
    createdBy: actorAndTime.actorId,
    createdAt: actorAndTime.now,
  };
  const document: EditorialDocumentSnapshot = {
    id,
    kind: input.kind,
    slug,
    workflowStatus: "draft",
    publicationStatus: "unpublished",
    workingRevisionId: revision.id,
    approvedRevisionId: null,
    publishedRevisionId: null,
    lastPublishedRevisionId: null,
    version: 1,
    createdAt: actorAndTime.now,
    updatedAt: actorAndTime.now,
  };
  return { ok: true, document, revision };
}

export function createEditorialRevision(
  document: EditorialDocumentSnapshot,
  input: CreateEditorialRevisionInput,
  context: CreateEditorialRevisionContext,
): EditorialRevisionCreationResult {
  if (validateDocumentState(document).length > 0) {
    return { ok: false, code: "INVALID_CURRENT_STATE" };
  }
  const expected = normalizedIso(context.expectedUpdatedAt);
  if (expected === null || expected !== normalizedIso(document.updatedAt)) {
    return { ok: false, code: "STALE_STATE" };
  }

  const actorAndTime = validateActorAndTime(context.actorId, context.now);
  const revisionInput = validateRevisionContent(input);
  const errors = [...actorAndTime.errors, ...revisionInput.errors];
  if (
    actorAndTime.now !== null &&
    Date.parse(actorAndTime.now) < Date.parse(document.updatedAt)
  ) {
    errors.push("TIMESTAMP_BEFORE_CURRENT");
  }
  if (revisionInput.revisionId === document.workingRevisionId) {
    errors.push("ID_INVALID");
  }
  if (errors.length > 0 || actorAndTime.now === null) {
    return { ok: false, code: "VALIDATION_FAILED", errors: [...new Set(errors)] };
  }

  const revision: EditorialRevisionSnapshot = {
    id: revisionInput.revisionId,
    documentId: document.id,
    sequence: document.version + 1,
    title: revisionInput.title,
    excerpt: revisionInput.excerpt,
    bodyMarkdown: revisionInput.bodyMarkdown,
    tags: revisionInput.tags,
    contentHash: revisionInput.contentHash,
    createdBy: actorAndTime.actorId,
    createdAt: actorAndTime.now,
  };
  return {
    ok: true,
    document: {
      ...document,
      workflowStatus: "draft",
      workingRevisionId: revision.id,
      approvedRevisionId: null,
      version: document.version + 1,
      updatedAt: actorAndTime.now,
    },
    revision,
  };
}

export function applyEditorialTransition(
  document: EditorialDocumentSnapshot,
  command: EditorialTransitionCommand,
  context: EditorialTransitionContext,
): EditorialTransitionResult {
  const resolvedContext = transitionContextState(document, context);
  if (!resolvedContext.ok) return resolvedContext.result;
  const { actorId, now } = resolvedContext;

  if (command.kind === "submit_for_review") {
    if (document.workflowStatus !== "draft") {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const errors = revisionMatchesDocument(document, command.revision);
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }
    const after = {
      ...document,
      workflowStatus: "in_review" as const,
      approvedRevisionId: null,
      version: document.version + 1,
      updatedAt: now,
    };
    return successTransition(
      document,
      after,
      "editorial.submitted_for_review",
      command,
      context,
      actorId,
      now,
    );
  }

  if (command.kind === "reopen_draft") {
    if (
      document.workflowStatus !== "in_review" &&
      document.workflowStatus !== "approved"
    ) {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const errors = [
      ...revisionMatchesDocument(document, command.revision),
      ...validateReason(command.reason),
    ];
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }
    const after = {
      ...document,
      workflowStatus: "draft" as const,
      approvedRevisionId: null,
      version: document.version + 1,
      updatedAt: now,
    };
    return successTransition(
      document,
      after,
      "editorial.reopened_as_draft",
      command,
      context,
      actorId,
      now,
    );
  }

  if (command.kind === "approve") {
    if (document.workflowStatus !== "in_review") {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const errors = [
      ...revisionMatchesDocument(document, command.revision),
      ...validateApproval(document, command.revision, command.approval),
    ];
    if (errors.length > 0) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: [...new Set(errors)],
      };
    }
    const after = {
      ...document,
      workflowStatus: "approved" as const,
      approvedRevisionId: command.revision.id,
      version: document.version + 1,
      updatedAt: now,
    };
    return successTransition(
      document,
      after,
      "editorial.approved",
      command,
      context,
      actorId,
      now,
    );
  }

  if (command.kind === "publish") {
    if (
      document.workflowStatus !== "approved" ||
      document.approvedRevisionId !== command.revision.id
    ) {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const errors = [
      ...revisionMatchesDocument(document, command.revision),
      ...validateApproval(document, command.revision, command.approval),
    ];
    if (errors.length > 0) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: [...new Set(errors)],
      };
    }
    const after = {
      ...document,
      publicationStatus: "published" as const,
      publishedRevisionId: command.revision.id,
      lastPublishedRevisionId: command.revision.id,
      version: document.version + 1,
      updatedAt: now,
    };
    return successTransition(
      document,
      after,
      "editorial.published",
      command,
      context,
      actorId,
      now,
    );
  }

  if (command.kind === "withdraw") {
    if (
      document.publicationStatus !== "published" ||
      document.publishedRevisionId === null
    ) {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const errors = validateReason(command.reason);
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }
    const after = {
      ...document,
      publicationStatus: "withdrawn" as const,
      publishedRevisionId: null,
      version: document.version + 1,
      updatedAt: now,
    };
    return successTransition(
      document,
      after,
      "editorial.withdrawn",
      command,
      context,
      actorId,
      now,
    );
  }

  if (
    document.publicationStatus !== "published" &&
    document.publicationStatus !== "withdrawn"
  ) {
    return { ok: false, code: "INVALID_TRANSITION" };
  }
  const errors = [
    ...(command.revision.documentId === document.id
      ? []
      : (["REVISION_DOCUMENT_MISMATCH"] as EditorialValidationError[])),
    ...validateApproval(document, command.revision, command.approval),
    ...validateReason(command.reason),
  ];
  if (errors.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [...new Set(errors)],
    };
  }
  const after = {
    ...document,
    publicationStatus: "published" as const,
    publishedRevisionId: command.revision.id,
    lastPublishedRevisionId: command.revision.id,
    version: document.version + 1,
    updatedAt: now,
  };
  return successTransition(
    document,
    after,
    "editorial.rolled_back",
    command,
    context,
    actorId,
    now,
  );
}

export function projectPublishedEditorialDocument(
  document: EditorialDocumentSnapshot,
  revision: EditorialRevisionSnapshot,
): EditorialPublicProjection | null {
  if (
    document.publicationStatus !== "published" ||
    document.publishedRevisionId === null ||
    document.publishedRevisionId !== revision.id ||
    revision.documentId !== document.id
  ) {
    return null;
  }

  return {
    kind: document.kind,
    slug: document.slug,
    title: revision.title,
    excerpt: revision.excerpt,
    bodyMarkdown: revision.bodyMarkdown,
    tags: revision.tags,
    contentHash: revision.contentHash,
    publishedRevisionId: revision.id,
    updatedAt: document.updatedAt,
  };
}
