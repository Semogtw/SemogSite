export type RecoveryConfidence = "high" | "medium" | "low";
export type RecoveryPushState = "confirmed" | "unconfirmed" | "not_pushed";
export type RecoveryTestStatus =
  | "not_run"
  | "partial"
  | "passed"
  | "failed"
  | "blocked";

export type RecoverySnapshotInput = {
  snapshotId: string;
  generatedAt: string;
  sourceObservedAt: string;
  confidence: RecoveryConfidence;
  project: { id: string; slug: string; name: string };
  repository: {
    id: string;
    fullName: string;
    branch: string;
    observedCommitSha: string;
  };
  run: { id: string; phase: string; summary: string } | null;
  stage: { id: string; title: string; nextStep: string } | null;
  plan: { path: string; section: string } | null;
  commits: readonly { sha: string; message: string }[];
  pushState: RecoveryPushState;
  tests: readonly {
    gateName: string;
    status: RecoveryTestStatus;
    summary: string;
  }[];
  obligations: readonly {
    id: string;
    gateName: string;
    status: string;
    nextAction: string;
  }[];
  reservations: readonly {
    id: string;
    repositoryId: string;
    branch: string;
    patterns: readonly string[];
    holderLabel: string;
    expiresAt: string;
  }[];
  blockers: readonly string[];
  decisions: readonly string[];
  nextAction: string;
  requiredDocuments: readonly string[];
  runtime: {
    label: string;
    capabilities: readonly string[];
    toolchainManifest: string | null;
  };
  continuation: {
    templateId: string;
    templateVersion: number;
    prompt: string;
  };
  warnings: readonly string[];
};

export type RecoverySnapshot = Omit<
  RecoverySnapshotInput,
  | "commits"
  | "tests"
  | "obligations"
  | "reservations"
  | "blockers"
  | "decisions"
  | "requiredDocuments"
  | "runtime"
  | "warnings"
> & {
  schemaVersion: 1;
  commits: readonly { sha: string; message: string }[];
  tests: readonly {
    gateName: string;
    status: RecoveryTestStatus;
    summary: string;
  }[];
  obligations: readonly {
    id: string;
    gateName: string;
    status: string;
    nextAction: string;
  }[];
  reservations: readonly {
    id: string;
    repositoryId: string;
    branch: string;
    patterns: readonly string[];
    holderLabel: string;
    expiresAt: string;
  }[];
  blockers: readonly string[];
  decisions: readonly string[];
  requiredDocuments: readonly string[];
  runtime: {
    label: string;
    capabilities: readonly string[];
    toolchainManifest: string | null;
  };
  warnings: readonly string[];
};

export type RecoverySnapshotValidationError =
  | "SNAPSHOT_ID_REQUIRED"
  | "GENERATED_AT_INVALID"
  | "SOURCE_OBSERVED_AT_INVALID"
  | "SOURCE_OBSERVED_AFTER_GENERATION"
  | "PROJECT_INVALID"
  | "REPOSITORY_INVALID"
  | "BRANCH_INVALID"
  | "OBSERVED_COMMIT_SHA_INVALID"
  | "COMMIT_INVALID"
  | "PUSH_STATE_INVALID"
  | "TEST_INVALID"
  | "OBLIGATION_INVALID"
  | "RESERVATION_INVALID"
  | "NEXT_ACTION_REQUIRED"
  | "REQUIRED_DOCUMENT_INVALID"
  | "RUNTIME_INVALID"
  | "CONTINUATION_INVALID"
  | "SENSITIVE_CONTENT_DETECTED"
  | "COLLECTION_LIMIT_EXCEEDED";

export type RecoverySnapshotResult =
  | {
      ok: true;
      snapshot: RecoverySnapshot;
      canonicalJson: string;
      markdown: string;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly RecoverySnapshotValidationError[];
    };

const shaPattern = /^[0-9a-f]{40}$/u;
const safeBranchPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const identifierPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,199})$/u;
const sensitivePattern =
  /(?:authorization\s*:|bearer\s+[a-z0-9._~+/-]{8,}|api[_-]?key\s*[:=]|access[_-]?token\s*[:=]|session[_-]?cookie\s*[:=]|-----begin [a-z ]*private key-----)/iu;
const pushStates = new Set<RecoveryPushState>([
  "confirmed",
  "unconfirmed",
  "not_pushed",
]);
const testStatuses = new Set<RecoveryTestStatus>([
  "not_run",
  "partial",
  "passed",
  "failed",
  "blocked",
]);
const confidenceValues = new Set<RecoveryConfidence>(["high", "medium", "low"]);
const maxCollectionLength = 100;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function safeBranch(value: string): boolean {
  return (
    safeBranchPattern.test(value) &&
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

function safeDocumentPath(value: string): boolean {
  const normalized = text(value);
  return (
    normalized.length > 0 &&
    normalized.length <= 500 &&
    !normalized.startsWith("/") &&
    !normalized.includes("\\") &&
    !normalized.includes("://") &&
    !normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..") &&
    !/\p{Cc}/u.test(normalized)
  );
}

function containsSensitiveContent(input: RecoverySnapshotInput): boolean {
  const values: string[] = [
    input.project.name,
    input.repository.fullName,
    input.run?.summary ?? "",
    input.stage?.nextStep ?? "",
    input.nextAction,
    input.runtime.label,
    input.runtime.toolchainManifest ?? "",
    input.continuation.prompt,
    ...input.commits.map((item) => item.message),
    ...input.tests.map((item) => item.summary),
    ...input.obligations.map((item) => item.nextAction),
    ...input.blockers,
    ...input.decisions,
    ...input.warnings,
  ];
  return values.some((value) => sensitivePattern.test(value));
}

function withinCollectionLimits(input: RecoverySnapshotInput): boolean {
  return [
    input.commits,
    input.tests,
    input.obligations,
    input.reservations,
    input.blockers,
    input.decisions,
    input.requiredDocuments,
    input.runtime.capabilities,
    input.warnings,
  ].every((collection) => collection.length <= maxCollectionLength);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function markdownList(values: readonly string[], emptyLabel: string): string {
  return values.length === 0
    ? `- ${emptyLabel}`
    : values.map((value) => `- ${value}`).join("\n");
}

function renderMarkdown(snapshot: RecoverySnapshot): string {
  const commits = snapshot.commits.map(
    (item) => `${item.sha.slice(0, 12)} — ${item.message}`,
  );
  const tests = snapshot.tests.map(
    (item) => `${item.gateName}: ${item.status} — ${item.summary}`,
  );
  const obligations = snapshot.obligations.map(
    (item) => `${item.gateName}: ${item.status} — ${item.nextAction}`,
  );
  const reservations = snapshot.reservations.map(
    (item) => `${item.holderLabel}: ${item.patterns.join(", ")} (até ${item.expiresAt})`,
  );

  return [
    `# Recovery snapshot — ${snapshot.project.name}`,
    "",
    `Snapshot: ${snapshot.snapshotId}`,
    `Generated: ${snapshot.generatedAt}`,
    `Data observed: ${snapshot.sourceObservedAt}`,
    `Confidence: ${snapshot.confidence}`,
    "",
    "## Repository state",
    "",
    `Repository: ${snapshot.repository.fullName}`,
    `Branch: ${snapshot.repository.branch}`,
    `Observed SHA: ${snapshot.repository.observedCommitSha}`,
    `Push state: ${snapshot.pushState}`,
    "",
    "## Current position",
    "",
    `Run: ${snapshot.run?.id ?? "none"}`,
    `Phase: ${snapshot.run?.phase ?? "not recorded"}`,
    `Stage: ${snapshot.stage?.title ?? "not recorded"}`,
    `Plan: ${snapshot.plan === null ? "not recorded" : `${snapshot.plan.path} — ${snapshot.plan.section}`}`,
    "",
    "## Commits",
    "",
    markdownList(commits, "No commits recorded."),
    "",
    "## Tests actually observed",
    "",
    markdownList(tests, "No tests recorded."),
    "",
    "## Verification obligations",
    "",
    markdownList(obligations, "No open obligations recorded."),
    "",
    "## Scope reservations",
    "",
    markdownList(reservations, "No reservations recorded."),
    "",
    "## Blockers",
    "",
    markdownList(snapshot.blockers, "No blockers recorded."),
    "",
    "## Decisions",
    "",
    markdownList(snapshot.decisions, "No decisions recorded."),
    "",
    "## Exact next action",
    "",
    snapshot.nextAction,
    "",
    "## Required documents",
    "",
    markdownList(snapshot.requiredDocuments, "No documents recorded."),
    "",
    "## Runtime",
    "",
    `Runtime: ${snapshot.runtime.label}`,
    `Capabilities: ${snapshot.runtime.capabilities.join(", ") || "none recorded"}`,
    `Toolchain: ${snapshot.runtime.toolchainManifest ?? "not recorded"}`,
    "",
    "## Continuation prompt",
    "",
    `Template: ${snapshot.continuation.templateId}@${snapshot.continuation.templateVersion}`,
    "",
    snapshot.continuation.prompt,
    "",
    "## Warnings",
    "",
    markdownList(snapshot.warnings, "No warnings recorded."),
    "",
  ].join("\n");
}

export function buildRecoverySnapshot(
  input: RecoverySnapshotInput,
): RecoverySnapshotResult {
  const errors = new Set<RecoverySnapshotValidationError>();
  const generatedAt = normalizeIso(input.generatedAt);
  const sourceObservedAt = normalizeIso(input.sourceObservedAt);
  const observedCommitSha = text(input.repository.observedCommitSha).toLowerCase();

  if (!identifierPattern.test(text(input.snapshotId))) errors.add("SNAPSHOT_ID_REQUIRED");
  if (generatedAt === null) errors.add("GENERATED_AT_INVALID");
  if (sourceObservedAt === null) errors.add("SOURCE_OBSERVED_AT_INVALID");
  if (
    generatedAt !== null &&
    sourceObservedAt !== null &&
    Date.parse(sourceObservedAt) > Date.parse(generatedAt)
  ) {
    errors.add("SOURCE_OBSERVED_AFTER_GENERATION");
  }
  if (
    !confidenceValues.has(input.confidence) ||
    !identifierPattern.test(text(input.project.id)) ||
    text(input.project.slug).length === 0 ||
    text(input.project.name).length === 0
  ) {
    errors.add("PROJECT_INVALID");
  }
  if (
    !identifierPattern.test(text(input.repository.id)) ||
    text(input.repository.fullName).length === 0
  ) {
    errors.add("REPOSITORY_INVALID");
  }
  if (!safeBranch(text(input.repository.branch))) errors.add("BRANCH_INVALID");
  if (!shaPattern.test(observedCommitSha)) {
    errors.add("OBSERVED_COMMIT_SHA_INVALID");
  }
  if (
    input.commits.some(
      (item) => !shaPattern.test(text(item.sha).toLowerCase()) || text(item.message).length === 0,
    )
  ) {
    errors.add("COMMIT_INVALID");
  }
  if (!pushStates.has(input.pushState)) errors.add("PUSH_STATE_INVALID");
  if (
    input.tests.some(
      (item) =>
        text(item.gateName).length === 0 ||
        !testStatuses.has(item.status) ||
        text(item.summary).length === 0,
    )
  ) {
    errors.add("TEST_INVALID");
  }
  if (
    input.obligations.some(
      (item) =>
        !identifierPattern.test(text(item.id)) ||
        text(item.gateName).length === 0 ||
        text(item.status).length === 0 ||
        text(item.nextAction).length === 0,
    )
  ) {
    errors.add("OBLIGATION_INVALID");
  }
  if (
    input.reservations.some(
      (item) =>
        !identifierPattern.test(text(item.id)) ||
        !identifierPattern.test(text(item.repositoryId)) ||
        !safeBranch(text(item.branch)) ||
        item.patterns.length === 0 ||
        text(item.holderLabel).length === 0 ||
        normalizeIso(item.expiresAt) === null,
    )
  ) {
    errors.add("RESERVATION_INVALID");
  }
  if (text(input.nextAction).length === 0) errors.add("NEXT_ACTION_REQUIRED");
  if (input.requiredDocuments.some((path) => !safeDocumentPath(path))) {
    errors.add("REQUIRED_DOCUMENT_INVALID");
  }
  if (
    text(input.runtime.label).length === 0 ||
    input.runtime.capabilities.some((capability) => text(capability).length === 0)
  ) {
    errors.add("RUNTIME_INVALID");
  }
  if (
    text(input.continuation.templateId).length === 0 ||
    !Number.isInteger(input.continuation.templateVersion) ||
    input.continuation.templateVersion < 1 ||
    text(input.continuation.prompt).length === 0
  ) {
    errors.add("CONTINUATION_INVALID");
  }
  if (containsSensitiveContent(input)) errors.add("SENSITIVE_CONTENT_DETECTED");
  if (!withinCollectionLimits(input)) errors.add("COLLECTION_LIMIT_EXCEEDED");

  if (errors.size > 0 || generatedAt === null || sourceObservedAt === null) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [...errors],
    };
  }

  const snapshot: RecoverySnapshot = {
    schemaVersion: 1,
    ...input,
    snapshotId: text(input.snapshotId),
    generatedAt,
    sourceObservedAt,
    project: {
      id: text(input.project.id),
      slug: text(input.project.slug),
      name: text(input.project.name),
    },
    repository: {
      id: text(input.repository.id),
      fullName: text(input.repository.fullName),
      branch: text(input.repository.branch),
      observedCommitSha,
    },
    commits: input.commits
      .map((item) => ({
        sha: text(item.sha).toLowerCase(),
        message: text(item.message),
      }))
      .sort((left, right) => left.sha.localeCompare(right.sha)),
    tests: [...input.tests]
      .map((item) => ({ ...item, gateName: text(item.gateName), summary: text(item.summary) }))
      .sort((left, right) => left.gateName.localeCompare(right.gateName)),
    obligations: [...input.obligations]
      .map((item) => ({
        ...item,
        id: text(item.id),
        gateName: text(item.gateName),
        status: text(item.status),
        nextAction: text(item.nextAction),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    reservations: [...input.reservations]
      .map((item) => ({
        ...item,
        id: text(item.id),
        repositoryId: text(item.repositoryId),
        branch: text(item.branch),
        patterns: uniqueSorted(item.patterns),
        holderLabel: text(item.holderLabel),
        expiresAt: normalizeIso(item.expiresAt) ?? item.expiresAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    blockers: uniqueSorted(input.blockers),
    decisions: uniqueSorted(input.decisions),
    nextAction: text(input.nextAction),
    requiredDocuments: uniqueSorted(input.requiredDocuments),
    runtime: {
      label: text(input.runtime.label),
      capabilities: uniqueSorted(input.runtime.capabilities),
      toolchainManifest: input.runtime.toolchainManifest === null
        ? null
        : text(input.runtime.toolchainManifest),
    },
    continuation: {
      templateId: text(input.continuation.templateId),
      templateVersion: input.continuation.templateVersion,
      prompt: text(input.continuation.prompt),
    },
    warnings: uniqueSorted(input.warnings),
  };

  const canonicalJson = JSON.stringify(canonicalize(snapshot));
  const markdown = renderMarkdown(snapshot);
  if (markdown.length > 20_000) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["COLLECTION_LIMIT_EXCEEDED"],
    };
  }
  return { ok: true, snapshot, canonicalJson, markdown };
}
