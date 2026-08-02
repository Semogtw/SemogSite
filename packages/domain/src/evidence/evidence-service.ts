import type { EvidenceStatus } from "../roadmap/stage";

export type ManualEvidenceKind =
  | "commit"
  | "pull_request"
  | "issue"
  | "workflow_run"
  | "test"
  | "document"
  | "manual_note";

export type AttachManualEvidenceInput = {
  projectId: string;
  stageId: string | null;
  kind: ManualEvidenceKind;
  title: string;
  url: string | null;
  externalId: string | null;
  status: EvidenceStatus;
  summary: string;
  occurredAt: string;
  reason: string;
  confirmed: boolean;
};

export type EvidenceContext = {
  actorId: string;
  evidenceId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type RecordedEvidence = {
  id: string;
  projectId: string;
  stageId: string | null;
  sessionId: null;
  repositoryId: null;
  kind: ManualEvidenceKind;
  title: string;
  url: string | null;
  externalId: string | null;
  status: EvidenceStatus;
  summary: string;
  occurredAt: string;
  capturedAt: string;
  sourceHash: null;
  source: "manual";
};

export type EvidenceAuditEvent = {
  id: string;
  actor: string;
  action: "evidence.create";
  entityType: "evidence";
  entityId: string;
  before: null;
  after: RecordedEvidence;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface EvidenceWriteRepository {
  insertEvidenceWithAudit(
    evidence: RecordedEvidence,
    audit: EvidenceAuditEvent,
  ): Promise<void>;
}

export type EvidenceValidationError =
  | "CONFIRMATION_REQUIRED"
  | "PROJECT_ID_REQUIRED"
  | "PROJECT_ID_TOO_LONG"
  | "STAGE_ID_TOO_LONG"
  | "KIND_INVALID"
  | "STATUS_INVALID"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "URL_INVALID"
  | "EXTERNAL_ID_TOO_LONG"
  | "SUMMARY_REQUIRED"
  | "SUMMARY_TOO_LONG"
  | "OCCURRED_AT_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type AttachManualEvidenceResult =
  | {
      ok: true;
      evidence: RecordedEvidence;
      audit: EvidenceAuditEvent;
    }
  | { ok: false; errors: readonly EvidenceValidationError[] };

const approvedKinds = new Set<ManualEvidenceKind>([
  "commit",
  "pull_request",
  "issue",
  "workflow_run",
  "test",
  "document",
  "manual_note",
]);
const approvedStatuses = new Set<EvidenceStatus>([
  "observed",
  "passed",
  "failed",
  "pending",
  "superseded",
]);
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function normalizeOptional(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function isValidTimestamp(value: string): boolean {
  return isoTimestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}

function isSafeHttpsUrl(value: string | null): boolean {
  if (value === null) return true;
  if (value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
}

function validate(input: {
  projectId: string;
  stageId: string | null;
  kind: ManualEvidenceKind;
  title: string;
  url: string | null;
  externalId: string | null;
  status: EvidenceStatus;
  summary: string;
  occurredAt: string;
  reason: string;
  confirmed: boolean;
}): EvidenceValidationError[] {
  const errors: EvidenceValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.projectId.length === 0) errors.push("PROJECT_ID_REQUIRED");
  else if (input.projectId.length > 200) errors.push("PROJECT_ID_TOO_LONG");
  if (input.stageId !== null && input.stageId.length > 200) {
    errors.push("STAGE_ID_TOO_LONG");
  }
  if (!approvedKinds.has(input.kind)) errors.push("KIND_INVALID");
  if (!approvedStatuses.has(input.status)) errors.push("STATUS_INVALID");
  if (input.title.length === 0) errors.push("TITLE_REQUIRED");
  else if (input.title.length > 200) errors.push("TITLE_TOO_LONG");
  if (!isSafeHttpsUrl(input.url)) errors.push("URL_INVALID");
  if (input.externalId !== null && input.externalId.length > 255) {
    errors.push("EXTERNAL_ID_TOO_LONG");
  }
  if (input.summary.length === 0) errors.push("SUMMARY_REQUIRED");
  else if (input.summary.length > 5_000) errors.push("SUMMARY_TOO_LONG");
  if (!isValidTimestamp(input.occurredAt)) {
    errors.push("OCCURRED_AT_INVALID");
  }
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class EvidenceService {
  constructor(private readonly repository: EvidenceWriteRepository) {}

  async attachManualEvidence(
    input: AttachManualEvidenceInput,
    context: EvidenceContext,
  ): Promise<AttachManualEvidenceResult> {
    const normalized = {
      projectId: input.projectId.trim(),
      stageId: normalizeOptional(input.stageId),
      title: input.title.trim(),
      url: normalizeOptional(input.url),
      externalId: normalizeOptional(input.externalId),
      summary: input.summary.trim(),
      occurredAt: input.occurredAt.trim(),
      reason: input.reason.trim(),
    };
    const errors = validate({
      projectId: normalized.projectId,
      stageId: normalized.stageId,
      kind: input.kind,
      title: normalized.title,
      url: normalized.url,
      externalId: normalized.externalId,
      status: input.status,
      summary: normalized.summary,
      occurredAt: normalized.occurredAt,
      reason: normalized.reason,
      confirmed: input.confirmed,
    });
    if (errors.length > 0) return { ok: false, errors };

    const evidence: RecordedEvidence = {
      id: context.evidenceId,
      projectId: normalized.projectId,
      stageId: normalized.stageId,
      sessionId: null,
      repositoryId: null,
      kind: input.kind,
      title: normalized.title,
      url: normalized.url,
      externalId: normalized.externalId,
      status: input.status,
      summary: normalized.summary,
      occurredAt: normalized.occurredAt,
      capturedAt: context.now,
      sourceHash: null,
      source: "manual",
    };
    const audit: EvidenceAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "evidence.create",
      entityType: "evidence",
      entityId: evidence.id,
      before: null,
      after: evidence,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };

    await this.repository.insertEvidenceWithAudit(evidence, audit);
    return { ok: true, evidence, audit };
  }
}
