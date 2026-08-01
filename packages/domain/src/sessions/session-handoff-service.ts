export type SessionTestsStatus =
  | "not_run"
  | "partial"
  | "passed"
  | "failed"
  | "blocked";

export type SessionResult =
  | "significant"
  | "partial"
  | "maintenance"
  | "no_change"
  | "failed";

export type RecordSessionHandoffInput = {
  projectId: string | null;
  title: string;
  sessionDate: string;
  branch: string | null;
  commits: readonly string[];
  completedSummary: string;
  testsStatus: SessionTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  result: SessionResult;
  reason: string;
  confirmed: boolean;
};

export type SessionHandoffContext = {
  actorId: string;
  sessionId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type RecordedDevelopmentSession = {
  id: string;
  projectId: string | null;
  title: string;
  sessionDate: string;
  actor: string;
  branch: string | null;
  commits: readonly string[];
  completedSummary: string;
  testsStatus: SessionTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  result: SessionResult;
  sourceUrl: null;
  automatic: false;
  sourceHash: null;
  source: "manual";
  createdAt: string;
  updatedAt: string;
};

export type SessionHandoffAuditEvent = {
  id: string;
  actor: string;
  action: "development_session.create";
  entityType: "development_session";
  entityId: string;
  before: null;
  after: RecordedDevelopmentSession;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface SessionHandoffRepository {
  insertSessionWithAudit(
    session: RecordedDevelopmentSession,
    audit: SessionHandoffAuditEvent,
  ): Promise<void>;
}

export type SessionHandoffValidationError =
  | "CONFIRMATION_REQUIRED"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "SESSION_DATE_INVALID"
  | "BRANCH_TOO_LONG"
  | "COMMIT_INVALID"
  | "COMPLETED_SUMMARY_REQUIRED"
  | "COMPLETED_SUMMARY_TOO_LONG"
  | "TESTS_SUMMARY_REQUIRED"
  | "TESTS_SUMMARY_TOO_LONG"
  | "BLOCKERS_TOO_LONG"
  | "NEXT_STEP_REQUIRED"
  | "NEXT_STEP_TOO_LONG"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type SessionHandoffResult =
  | {
      ok: true;
      session: RecordedDevelopmentSession;
      audit: SessionHandoffAuditEvent;
    }
  | {
      ok: false;
      errors: readonly SessionHandoffValidationError[];
    };

const commitPattern = /^[0-9a-f]{7,40}$/i;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function normalizeOptional(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeCommits(commits: readonly string[]): readonly string[] {
  return [...new Set(commits.map((commit) => commit.trim().toLowerCase()))];
}

function isValidIsoTimestamp(value: string): boolean {
  return isoTimestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}

function validate(input: {
  title: string;
  sessionDate: string;
  branch: string | null;
  commits: readonly string[];
  completedSummary: string;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  reason: string;
  confirmed: boolean;
}): SessionHandoffValidationError[] {
  const errors: SessionHandoffValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.title.length === 0) errors.push("TITLE_REQUIRED");
  else if (input.title.length > 160) errors.push("TITLE_TOO_LONG");
  if (!isValidIsoTimestamp(input.sessionDate)) {
    errors.push("SESSION_DATE_INVALID");
  }
  if (input.branch !== null && input.branch.length > 255) {
    errors.push("BRANCH_TOO_LONG");
  }
  if (input.commits.some((commit) => !commitPattern.test(commit))) {
    errors.push("COMMIT_INVALID");
  }
  if (input.completedSummary.length === 0) {
    errors.push("COMPLETED_SUMMARY_REQUIRED");
  } else if (input.completedSummary.length > 5_000) {
    errors.push("COMPLETED_SUMMARY_TOO_LONG");
  }
  if (input.testsSummary.length === 0) {
    errors.push("TESTS_SUMMARY_REQUIRED");
  } else if (input.testsSummary.length > 2_000) {
    errors.push("TESTS_SUMMARY_TOO_LONG");
  }
  if (input.blockers.length > 2_000) errors.push("BLOCKERS_TOO_LONG");
  if (input.nextStep.length === 0) errors.push("NEXT_STEP_REQUIRED");
  else if (input.nextStep.length > 1_000) errors.push("NEXT_STEP_TOO_LONG");
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class SessionHandoffService {
  constructor(private readonly repository: SessionHandoffRepository) {}

  async record(
    input: RecordSessionHandoffInput,
    context: SessionHandoffContext,
  ): Promise<SessionHandoffResult> {
    const normalized = {
      projectId: normalizeOptional(input.projectId),
      title: input.title.trim(),
      sessionDate: input.sessionDate.trim(),
      branch: normalizeOptional(input.branch),
      commits: normalizeCommits(input.commits),
      completedSummary: input.completedSummary.trim(),
      testsSummary: input.testsSummary.trim(),
      blockers: input.blockers.trim(),
      nextStep: input.nextStep.trim(),
      reason: input.reason.trim(),
    };
    const errors = validate({
      title: normalized.title,
      sessionDate: normalized.sessionDate,
      branch: normalized.branch,
      commits: normalized.commits,
      completedSummary: normalized.completedSummary,
      testsSummary: normalized.testsSummary,
      blockers: normalized.blockers,
      nextStep: normalized.nextStep,
      reason: normalized.reason,
      confirmed: input.confirmed,
    });
    if (errors.length > 0) return { ok: false, errors };

    const session: RecordedDevelopmentSession = {
      id: context.sessionId,
      projectId: normalized.projectId,
      title: normalized.title,
      sessionDate: normalized.sessionDate,
      actor: context.actorId,
      branch: normalized.branch,
      commits: normalized.commits,
      completedSummary: normalized.completedSummary,
      testsStatus: input.testsStatus,
      testsSummary: normalized.testsSummary,
      blockers: normalized.blockers,
      nextStep: normalized.nextStep,
      result: input.result,
      sourceUrl: null,
      automatic: false,
      sourceHash: null,
      source: "manual",
      createdAt: context.now,
      updatedAt: context.now,
    };
    const audit: SessionHandoffAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "development_session.create",
      entityType: "development_session",
      entityId: session.id,
      before: null,
      after: session,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };

    await this.repository.insertSessionWithAudit(session, audit);
    return { ok: true, session, audit };
  }
}
