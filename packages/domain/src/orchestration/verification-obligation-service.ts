export type VerificationObligationStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "superseded"
  | "waived";

export type VerificationFailureClassification =
  | "code_failure"
  | "environment_missing"
  | "flaky"
  | "timeout"
  | "quota"
  | "configuration"
  | "external_dependency"
  | "unknown";

export type VerificationObligationSnapshot = {
  id: string;
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  stageId: string | null;
  branch: string;
  targetCommitSha: string;
  gateName: string;
  command: string;
  requiredCapabilities: readonly string[];
  responsibleActor: string;
  nextAction: string;
  toolchainManifest: string | null;
  status: VerificationObligationStatus;
  failureClassification: VerificationFailureClassification | null;
  failureSignature: string | null;
  resultSummary: string | null;
  evidenceUrls: readonly string[];
  createdAt: string;
  lastAttemptAt: string | null;
  resolvedAt: string | null;
  version: number;
};

export type CreateVerificationObligationInput = {
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  stageId: string | null;
  branch: string;
  targetCommitSha: string;
  gateName: string;
  command: string;
  requiredCapabilities: readonly string[];
  responsibleActor: string;
  nextAction: string;
  toolchainManifest: string | null;
};

export type RecordVerificationResultInput = {
  obligationId: string;
  expectedVersion: number;
  outcome: "passed" | "failed" | "blocked";
  failureClassification: VerificationFailureClassification | null;
  resultSummary: string;
  evidenceUrls: readonly string[];
  nextAction: string;
};

export type SupersedeVerificationObligationInput = {
  obligationId: string;
  expectedVersion: number;
  reason: string;
};

export type WaiveVerificationObligationInput = {
  obligationId: string;
  expectedVersion: number;
  reason: string;
  confirmed: boolean;
};

export type VerificationObligationContext = {
  actorId: string;
  obligationId: string;
  auditId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
};

export type VerificationObligationAuditEvent = {
  id: string;
  actor: string;
  action:
    | "verification_obligation.create"
    | "verification_obligation.result"
    | "verification_obligation.supersede"
    | "verification_obligation.waive";
  entityType: "verification_obligation";
  entityId: string;
  before: VerificationObligationSnapshot | null;
  after: VerificationObligationSnapshot;
  reason: string;
  occurredAt: string;
  source: "manual" | "agent";
  confirmed: boolean;
  idempotencyKey: string;
  correlationId: string;
};

export type VerificationObligationStoreResult =
  | "created"
  | "updated"
  | "duplicate"
  | "project_not_found"
  | "repository_not_found"
  | "run_not_found"
  | "stage_not_found"
  | "conflict";

export interface VerificationObligationRepository {
  findById(id: string): Promise<VerificationObligationSnapshot | null>;
  create(
    obligation: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult>;
  update(
    before: VerificationObligationSnapshot,
    after: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult>;
}

export type VerificationObligationValidationError =
  | "ACTOR_ID_REQUIRED"
  | "OBLIGATION_ID_REQUIRED"
  | "AUDIT_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "NOW_INVALID"
  | "PROJECT_ID_INVALID"
  | "REPOSITORY_ID_REQUIRED"
  | "RUN_ID_INVALID"
  | "STAGE_ID_INVALID"
  | "BRANCH_INVALID"
  | "TARGET_COMMIT_SHA_INVALID"
  | "GATE_NAME_REQUIRED"
  | "GATE_NAME_TOO_LONG"
  | "COMMAND_REQUIRED"
  | "COMMAND_TOO_LONG"
  | "CAPABILITIES_REQUIRED"
  | "CAPABILITY_INVALID"
  | "RESPONSIBLE_ACTOR_REQUIRED"
  | "RESPONSIBLE_ACTOR_TOO_LONG"
  | "NEXT_ACTION_REQUIRED"
  | "NEXT_ACTION_TOO_LONG"
  | "TOOLCHAIN_MANIFEST_TOO_LONG"
  | "EXPECTED_VERSION_INVALID"
  | "OUTCOME_INVALID"
  | "FAILURE_CLASSIFICATION_REQUIRED"
  | "PASS_CLASSIFICATION_FORBIDDEN"
  | "RESULT_SUMMARY_REQUIRED"
  | "RESULT_SUMMARY_TOO_LONG"
  | "EVIDENCE_URL_INVALID"
  | "TOO_MANY_EVIDENCE_URLS"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED";

export type VerificationObligationResult =
  | {
      ok: true;
      obligation: VerificationObligationSnapshot;
      audit: VerificationObligationAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly VerificationObligationValidationError[];
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "STALE_STATE"
        | "TERMINAL_OBLIGATION"
        | "DUPLICATE"
        | "PROJECT_NOT_FOUND"
        | "REPOSITORY_NOT_FOUND"
        | "RUN_NOT_FOUND"
        | "STAGE_NOT_FOUND"
        | "CONFLICT";
    };

const idPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,199})$/u;
const shaPattern = /^[0-9a-f]{40}$/u;
const branchCharacterPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const capabilityPattern = /^[a-z0-9](?:[a-z0-9._:+-]{0,99})$/u;
const terminalStatuses = new Set<VerificationObligationStatus>([
  "passed",
  "superseded",
  "waived",
]);
const failureClassifications = new Set<VerificationFailureClassification>([
  "code_failure",
  "environment_missing",
  "flaky",
  "timeout",
  "quota",
  "configuration",
  "external_dependency",
  "unknown",
]);

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

function normalizeCapabilities(
  values: readonly string[],
): { values: readonly string[]; valid: boolean } {
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()))]
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));
  return {
    values: normalized,
    valid: normalized.length > 0 && normalized.every((value) => capabilityPattern.test(value)),
  };
}

function normalizeEvidenceUrls(
  values: readonly string[],
): { values: readonly string[]; valid: boolean; tooMany: boolean } {
  if (values.length > 20) return { values: [], valid: false, tooMany: true };
  const normalized: string[] = [];
  for (const rawValue of values) {
    try {
      const url = new URL(rawValue.trim());
      if (
        url.protocol !== "https:" ||
        url.username.length > 0 ||
        url.password.length > 0
      ) {
        return { values: [], valid: false, tooMany: false };
      }
      normalized.push(url.toString());
    } catch {
      return { values: [], valid: false, tooMany: false };
    }
  }
  return {
    values: [...new Set(normalized)].sort((left, right) => left.localeCompare(right)),
    valid: true,
    tooMany: false,
  };
}

function normalizedFailureSummary(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("\\", "/")
    .replace(/(?:[a-z]:)?\/(?:[^\s:]+\/)*(?=(?:apps|packages|scripts|tests)\/)/giu, "")
    .replace(/:\d+(?::\d+)?/gu, ":#")
    .replace(/\s+/gu, " ");
}

export function normalizeVerificationFailureSignature(input: {
  gateName: string;
  classification: VerificationFailureClassification;
  summary: string;
}): string {
  return [
    text(input.gateName).toLowerCase().replace(/\s+/gu, " "),
    input.classification,
    normalizedFailureSummary(input.summary),
  ].join("|");
}

function contextErrors(
  context: VerificationObligationContext,
): { errors: VerificationObligationValidationError[]; now: string | null } {
  const errors: VerificationObligationValidationError[] = [];
  if (text(context.actorId).length === 0) errors.push("ACTOR_ID_REQUIRED");
  if (!idPattern.test(text(context.obligationId))) {
    errors.push("OBLIGATION_ID_REQUIRED");
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
  context: VerificationObligationContext;
  action: VerificationObligationAuditEvent["action"];
  before: VerificationObligationSnapshot | null;
  after: VerificationObligationSnapshot;
  reason: string;
  confirmed?: boolean;
  source?: "manual" | "agent";
}): VerificationObligationAuditEvent {
  return {
    id: text(input.context.auditId),
    actor: text(input.context.actorId),
    action: input.action,
    entityType: "verification_obligation",
    entityId: input.after.id,
    before: input.before,
    after: input.after,
    reason: input.reason,
    occurredAt: normalizedIso(input.context.now) ?? input.context.now,
    source: input.source ?? "agent",
    confirmed: input.confirmed ?? false,
    idempotencyKey: text(input.context.idempotencyKey),
    correlationId: text(input.context.correlationId),
  };
}

function mapStoreFailure(
  result: VerificationObligationStoreResult,
): VerificationObligationResult {
  if (result === "duplicate") return { ok: false, code: "DUPLICATE" };
  if (result === "project_not_found") {
    return { ok: false, code: "PROJECT_NOT_FOUND" };
  }
  if (result === "repository_not_found") {
    return { ok: false, code: "REPOSITORY_NOT_FOUND" };
  }
  if (result === "run_not_found") return { ok: false, code: "RUN_NOT_FOUND" };
  if (result === "stage_not_found") {
    return { ok: false, code: "STAGE_NOT_FOUND" };
  }
  return { ok: false, code: "CONFLICT" };
}

export class VerificationObligationService {
  constructor(private readonly repository: VerificationObligationRepository) {}

  async create(
    input: CreateVerificationObligationInput,
    context: VerificationObligationContext,
  ): Promise<VerificationObligationResult> {
    const { errors, now } = contextErrors(context);
    const projectId = nullableText(input.projectId);
    const repositoryId = text(input.repositoryId);
    const runId = nullableText(input.runId);
    const stageId = nullableText(input.stageId);
    const branch = text(input.branch);
    const targetCommitSha = text(input.targetCommitSha).toLowerCase();
    const gateName = text(input.gateName);
    const command = text(input.command);
    const capabilities = normalizeCapabilities(input.requiredCapabilities);
    const responsibleActor = text(input.responsibleActor);
    const nextAction = text(input.nextAction);
    const toolchainManifest = nullableText(input.toolchainManifest);

    if (projectId !== null && !idPattern.test(projectId)) {
      errors.push("PROJECT_ID_INVALID");
    }
    if (!idPattern.test(repositoryId)) errors.push("REPOSITORY_ID_REQUIRED");
    if (runId !== null && !idPattern.test(runId)) errors.push("RUN_ID_INVALID");
    if (stageId !== null && !idPattern.test(stageId)) errors.push("STAGE_ID_INVALID");
    if (!safeBranchName(branch)) errors.push("BRANCH_INVALID");
    if (!shaPattern.test(targetCommitSha)) {
      errors.push("TARGET_COMMIT_SHA_INVALID");
    }
    if (gateName.length === 0) errors.push("GATE_NAME_REQUIRED");
    else if (gateName.length > 200) errors.push("GATE_NAME_TOO_LONG");
    if (command.length === 0) errors.push("COMMAND_REQUIRED");
    else if (command.length > 2_000) errors.push("COMMAND_TOO_LONG");
    if (capabilities.values.length === 0) errors.push("CAPABILITIES_REQUIRED");
    else if (!capabilities.valid) errors.push("CAPABILITY_INVALID");
    if (responsibleActor.length === 0) {
      errors.push("RESPONSIBLE_ACTOR_REQUIRED");
    } else if (responsibleActor.length > 100) {
      errors.push("RESPONSIBLE_ACTOR_TOO_LONG");
    }
    if (nextAction.length === 0) errors.push("NEXT_ACTION_REQUIRED");
    else if (nextAction.length > 1_000) errors.push("NEXT_ACTION_TOO_LONG");
    if (toolchainManifest !== null && toolchainManifest.length > 500) {
      errors.push("TOOLCHAIN_MANIFEST_TOO_LONG");
    }

    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const obligation: VerificationObligationSnapshot = {
      id: text(context.obligationId),
      projectId,
      repositoryId,
      runId,
      stageId,
      branch,
      targetCommitSha,
      gateName,
      command,
      requiredCapabilities: capabilities.values,
      responsibleActor,
      nextAction,
      toolchainManifest,
      status: "pending",
      failureClassification: null,
      failureSignature: null,
      resultSummary: null,
      evidenceUrls: [],
      createdAt: now,
      lastAttemptAt: null,
      resolvedAt: null,
      version: 1,
    };
    const audit = auditEvent({
      context,
      action: "verification_obligation.create",
      before: null,
      after: obligation,
      reason: `Create required gate: ${gateName}`,
    });
    const stored = await this.repository.create(obligation, audit);
    if (stored !== "created") return mapStoreFailure(stored);
    return { ok: true, obligation, audit };
  }

  async recordResult(
    input: RecordVerificationResultInput,
    context: VerificationObligationContext,
  ): Promise<VerificationObligationResult> {
    const { errors, now } = contextErrors(context);
    const obligationId = text(input.obligationId);
    const resultSummary = text(input.resultSummary);
    const nextAction = text(input.nextAction);
    const evidence = normalizeEvidenceUrls(input.evidenceUrls);

    if (!idPattern.test(obligationId)) errors.push("OBLIGATION_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (!new Set(["passed", "failed", "blocked"]).has(input.outcome)) {
      errors.push("OUTCOME_INVALID");
    }
    if (input.outcome === "passed" && input.failureClassification !== null) {
      errors.push("PASS_CLASSIFICATION_FORBIDDEN");
    }
    if (
      input.outcome !== "passed" &&
      (input.failureClassification === null ||
        !failureClassifications.has(input.failureClassification))
    ) {
      errors.push("FAILURE_CLASSIFICATION_REQUIRED");
    }
    if (resultSummary.length === 0) errors.push("RESULT_SUMMARY_REQUIRED");
    else if (resultSummary.length > 2_000) errors.push("RESULT_SUMMARY_TOO_LONG");
    if (nextAction.length === 0) errors.push("NEXT_ACTION_REQUIRED");
    else if (nextAction.length > 1_000) errors.push("NEXT_ACTION_TOO_LONG");
    if (evidence.tooMany) errors.push("TOO_MANY_EVIDENCE_URLS");
    else if (!evidence.valid) errors.push("EVIDENCE_URL_INVALID");

    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(obligationId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (terminalStatuses.has(before.status)) {
      return { ok: false, code: "TERMINAL_OBLIGATION" };
    }

    const failureClassification = input.failureClassification;
    const after: VerificationObligationSnapshot = {
      ...before,
      status: input.outcome,
      failureClassification,
      failureSignature:
        failureClassification === null
          ? null
          : normalizeVerificationFailureSignature({
              gateName: before.gateName,
              classification: failureClassification,
              summary: resultSummary,
            }),
      resultSummary,
      evidenceUrls: evidence.values,
      nextAction,
      lastAttemptAt: now,
      resolvedAt: input.outcome === "passed" ? now : null,
      version: before.version + 1,
    };
    const audit = auditEvent({
      context,
      action: "verification_obligation.result",
      before,
      after,
      reason: resultSummary,
    });
    const stored = await this.repository.update(before, after, audit);
    if (stored !== "updated") return mapStoreFailure(stored);
    return { ok: true, obligation: after, audit };
  }

  async supersede(
    input: SupersedeVerificationObligationInput,
    context: VerificationObligationContext,
  ): Promise<VerificationObligationResult> {
    return this.resolveOwnerDecision(
      input,
      context,
      "superseded",
      "verification_obligation.supersede",
      false,
    );
  }

  async waive(
    input: WaiveVerificationObligationInput,
    context: VerificationObligationContext,
  ): Promise<VerificationObligationResult> {
    return this.resolveOwnerDecision(
      input,
      context,
      "waived",
      "verification_obligation.waive",
      input.confirmed,
    );
  }

  private async resolveOwnerDecision(
    input: SupersedeVerificationObligationInput | WaiveVerificationObligationInput,
    context: VerificationObligationContext,
    status: "superseded" | "waived",
    action:
      | "verification_obligation.supersede"
      | "verification_obligation.waive",
    confirmed: boolean,
  ): Promise<VerificationObligationResult> {
    const { errors, now } = contextErrors(context);
    const obligationId = text(input.obligationId);
    const reason = text(input.reason);
    if (status === "waived" && !confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (!idPattern.test(obligationId)) errors.push("OBLIGATION_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 1_000) errors.push("REASON_TOO_LONG");
    if (errors.length > 0 || now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(obligationId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (terminalStatuses.has(before.status)) {
      return { ok: false, code: "TERMINAL_OBLIGATION" };
    }

    const after: VerificationObligationSnapshot = {
      ...before,
      status,
      resultSummary: reason,
      nextAction: status === "superseded" ? "Create a gate for the current commit." : before.nextAction,
      resolvedAt: now,
      version: before.version + 1,
    };
    const audit = auditEvent({
      context,
      action,
      before,
      after,
      reason,
      confirmed,
      source: "manual",
    });
    const stored = await this.repository.update(before, after, audit);
    if (stored !== "updated") return mapStoreFailure(stored);
    return { ok: true, obligation: after, audit };
  }
}
