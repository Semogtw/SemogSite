import type { ProjectResumePolicy } from "./development-activity";

export type ResumeProviderKind =
  | "chatgpt"
  | "gemini"
  | "claude"
  | "custom_web"
  | "local_agent"
  | "generic";

export type ProjectResumePolicySnapshot = ProjectResumePolicy & {
  id: string;
  projectId: string | null;
  repositoryId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AiResumeTarget = {
  id: string;
  projectId: string | null;
  label: string;
  providerKind: ResumeProviderKind;
  launchUrl: string;
  deepLinkTemplate: null;
  enabled: boolean;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ResumePromptTemplate = {
  id: string;
  projectId: string | null;
  name: string;
  template: string;
  enabled: boolean;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ResumeConfigurationEntityKind = "policy" | "target" | "template";
export type ResumeConfigurationSnapshot =
  | ProjectResumePolicySnapshot
  | AiResumeTarget
  | ResumePromptTemplate;

export type ResumeConfigurationReplay = {
  entityKind: ResumeConfigurationEntityKind;
  entityId: string;
  intentFingerprint: string;
  snapshot: ResumeConfigurationSnapshot;
};

export type ResumeConfigurationAuditEvent = {
  id: string;
  actor: string;
  action: "resume.policy.save" | "resume.target.save" | "resume.template.save";
  entityType: "project_resume_policy" | "ai_resume_target" | "resume_prompt_template";
  entityId: string;
  before: ResumeConfigurationSnapshot | null;
  after: ResumeConfigurationSnapshot;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
  idempotencyKey: string;
};

export type ResumeConfigurationStoreResult<T extends ResumeConfigurationSnapshot> =
  | { status: "stored"; snapshot: T }
  | { status: "duplicate"; snapshot: T; intentFingerprint: string }
  | { status: "conflict" };

export interface ResumeConfigurationRepository {
  findReplay(idempotencyKey: string): Promise<ResumeConfigurationReplay | null>;
  findPolicy(
    projectId: string | null,
    repositoryId: string | null,
  ): Promise<ProjectResumePolicySnapshot | null>;
  findTarget(targetId: string): Promise<AiResumeTarget | null>;
  listTargets(projectId: string | null): Promise<readonly AiResumeTarget[]>;
  findTemplate(templateId: string): Promise<ResumePromptTemplate | null>;
  listTemplates(projectId: string | null): Promise<readonly ResumePromptTemplate[]>;
  savePolicy(
    snapshot: ProjectResumePolicySnapshot,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<ProjectResumePolicySnapshot>>;
  saveTarget(
    snapshot: AiResumeTarget,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<AiResumeTarget>>;
  saveTemplate(
    snapshot: ResumePromptTemplate,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<ResumePromptTemplate>>;
}

export type ResumeConfigurationContext = {
  actorId: string;
  entityId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string;
};

export type SaveProjectResumePolicyInput = ProjectResumePolicy & {
  projectId: string | null;
  repositoryId: string | null;
  expectedVersion: number | null;
  reason: string;
  confirmed: boolean;
};

export type SaveAiResumeTargetInput = {
  projectId: string | null;
  label: string;
  providerKind: ResumeProviderKind;
  launchUrl: string;
  deepLinkTemplate: string | null;
  enabled: boolean;
  isDefault: boolean;
  expectedVersion: number | null;
  reason: string;
  confirmed: boolean;
};

export type SaveResumePromptTemplateInput = {
  projectId: string | null;
  name: string;
  template: string;
  enabled: boolean;
  isDefault: boolean;
  expectedVersion: number | null;
  reason: string;
  confirmed: boolean;
};

export type ResumeConfigurationValidationError =
  | "ACTOR_REQUIRED"
  | "ENTITY_ID_INVALID"
  | "EVENT_ID_INVALID"
  | "IDEMPOTENCY_KEY_INVALID"
  | "CORRELATION_ID_INVALID"
  | "TIMESTAMP_INVALID"
  | "CONFIRMATION_REQUIRED"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "PROJECT_ID_INVALID"
  | "REPOSITORY_ID_INVALID"
  | "EXPECTED_VERSION_INVALID"
  | "POLICY_THRESHOLD_ORDER_INVALID"
  | "POLICY_THRESHOLD_RANGE_INVALID"
  | "TARGET_LABEL_REQUIRED"
  | "TARGET_LABEL_TOO_LONG"
  | "TARGET_PROVIDER_INVALID"
  | "TARGET_URL_INVALID"
  | "TARGET_URL_CREDENTIALS_FORBIDDEN"
  | "TARGET_URL_SCHEME_FORBIDDEN"
  | "TARGET_URL_HTTPS_REQUIRED"
  | "TARGET_DEEP_LINK_UNSUPPORTED"
  | "TARGET_DEFAULT_REQUIRES_ENABLED"
  | "TEMPLATE_NAME_REQUIRED"
  | "TEMPLATE_NAME_TOO_LONG"
  | "TEMPLATE_REQUIRED"
  | "TEMPLATE_TOO_LONG"
  | "TEMPLATE_SYNTAX_INVALID"
  | `TEMPLATE_PLACEHOLDER_UNSUPPORTED:${string}`
  | "TEMPLATE_DEFAULT_REQUIRES_ENABLED";

export type ResumeConfigurationFailure =
  | { ok: false; code: "VALIDATION_FAILED"; errors: readonly ResumeConfigurationValidationError[] }
  | {
      ok: false;
      code:
        | "IDEMPOTENCY_CONFLICT"
        | "STALE_STATE"
        | "DEFAULT_TARGET_EXISTS"
        | "DEFAULT_TEMPLATE_EXISTS"
        | "CONFLICT";
    };

export type SavePolicyResult =
  | { ok: true; policy: ProjectResumePolicySnapshot; audit: ResumeConfigurationAuditEvent; duplicate: boolean }
  | ResumeConfigurationFailure;
export type SaveTargetResult =
  | { ok: true; target: AiResumeTarget; audit: ResumeConfigurationAuditEvent; duplicate: boolean }
  | ResumeConfigurationFailure;
export type SaveTemplateResult =
  | { ok: true; template: ResumePromptTemplate; audit: ResumeConfigurationAuditEvent; duplicate: boolean }
  | ResumeConfigurationFailure;

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/u;
const providerKinds = new Set<ResumeProviderKind>([
  "chatgpt",
  "gemini",
  "claude",
  "custom_web",
  "local_agent",
  "generic",
]);
const allowedPlaceholders = new Set([
  "project_name",
  "project_slug",
  "repository_full_name",
  "branch",
  "head_sha",
  "commit_time",
  "activity_age",
  "activity_status",
  "stage",
  "current_position",
  "next_step",
  "blocker",
  "test_evidence",
  "previous_handoff",
  "generated_at",
  "activity_source",
  "confidence",
]);

type ResolvedContext = {
  actorId: string;
  entityId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  now: string | null;
  reason: string;
};

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function normalizedNullableId(
  value: string | null,
  error: "PROJECT_ID_INVALID" | "REPOSITORY_ID_INVALID",
  errors: ResumeConfigurationValidationError[],
): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!idPattern.test(normalized)) errors.push(error);
  return normalized;
}

function validateCommon(
  input: { reason: string; confirmed: boolean; expectedVersion: number | null },
  context: ResumeConfigurationContext,
): { errors: ResumeConfigurationValidationError[]; resolved: ResolvedContext } {
  const errors: ResumeConfigurationValidationError[] = [];
  const actorId = context.actorId.trim();
  const entityId = context.entityId.trim();
  const eventId = context.eventId.trim();
  const idempotencyKey = context.idempotencyKey.trim();
  const correlationId = context.correlationId.trim();
  const now = normalizedIso(context.now);
  const reason = input.reason.trim();

  if (actorId.length === 0) errors.push("ACTOR_REQUIRED");
  if (!idPattern.test(entityId)) errors.push("ENTITY_ID_INVALID");
  if (!idPattern.test(eventId)) errors.push("EVENT_ID_INVALID");
  if (!idPattern.test(idempotencyKey)) errors.push("IDEMPOTENCY_KEY_INVALID");
  if (!idPattern.test(correlationId)) errors.push("CORRELATION_ID_INVALID");
  if (now === null) errors.push("TIMESTAMP_INVALID");
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (reason.length === 0) errors.push("REASON_REQUIRED");
  else if (reason.length > 500) errors.push("REASON_TOO_LONG");
  if (
    input.expectedVersion !== null &&
    (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
  ) {
    errors.push("EXPECTED_VERSION_INVALID");
  }
  return {
    errors,
    resolved: { actorId, entityId, eventId, idempotencyKey, correlationId, now, reason },
  };
}

function intentFingerprint(entityKind: ResumeConfigurationEntityKind, value: object): string {
  return JSON.stringify({ entityKind, ...value });
}

function safeLaunchUrl(value: string): {
  normalized: string | null;
  error: ResumeConfigurationValidationError | null;
} {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { normalized: null, error: "TARGET_URL_INVALID" };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { normalized: null, error: "TARGET_URL_CREDENTIALS_FORBIDDEN" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { normalized: null, error: "TARGET_URL_SCHEME_FORBIDDEN" };
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !loopback) {
    return { normalized: null, error: "TARGET_URL_HTTPS_REQUIRED" };
  }
  return { normalized: url.toString(), error: null };
}

function audit(
  context: ResolvedContext,
  entityKind: ResumeConfigurationEntityKind,
  before: ResumeConfigurationSnapshot | null,
  after: ResumeConfigurationSnapshot,
): ResumeConfigurationAuditEvent {
  const action = `resume.${entityKind}.save` as ResumeConfigurationAuditEvent["action"];
  const entityType = {
    policy: "project_resume_policy",
    target: "ai_resume_target",
    template: "resume_prompt_template",
  }[entityKind] as ResumeConfigurationAuditEvent["entityType"];
  return {
    id: context.eventId,
    actor: context.actorId,
    action,
    entityType,
    entityId: context.entityId,
    before,
    after,
    reason: context.reason,
    occurredAt: context.now as string,
    source: "manual",
    confirmed: true,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
  };
}

function matchesReplay(
  replay: ResumeConfigurationReplay,
  entityKind: ResumeConfigurationEntityKind,
  entityId: string,
  fingerprint: string,
): boolean {
  return (
    replay.entityKind === entityKind &&
    replay.entityId === entityId &&
    replay.intentFingerprint === fingerprint
  );
}

function expectedVersionMatches(
  current: { version: number } | null,
  expectedVersion: number | null,
): boolean {
  return current === null ? expectedVersion === null : current.version === expectedVersion;
}

export class ResumeConfigurationService {
  constructor(private readonly repository: ResumeConfigurationRepository) {}

  async savePolicy(
    input: SaveProjectResumePolicyInput,
    context: ResumeConfigurationContext,
  ): Promise<SavePolicyResult> {
    const common = validateCommon(input, context);
    const errors = common.errors;
    const projectId = normalizedNullableId(input.projectId, "PROJECT_ID_INVALID", errors);
    const repositoryId = normalizedNullableId(
      input.repositoryId,
      "REPOSITORY_ID_INVALID",
      errors,
    );
    const thresholds = [
      input.warningAfterMinutes,
      input.probablyEndedAfterMinutes,
      input.observationStaleAfterMinutes,
    ];
    if (thresholds.some((value) => !Number.isInteger(value) || value < 5 || value > 10_080)) {
      errors.push("POLICY_THRESHOLD_RANGE_INVALID");
    } else if (
      input.probablyEndedAfterMinutes <= input.warningAfterMinutes ||
      input.observationStaleAfterMinutes <= input.probablyEndedAfterMinutes
    ) {
      errors.push("POLICY_THRESHOLD_ORDER_INVALID");
    }
    if (errors.length > 0 || common.resolved.now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const fingerprint = intentFingerprint("policy", {
      actorId: common.resolved.actorId,
      entityId: common.resolved.entityId,
      projectId,
      repositoryId,
      warningAfterMinutes: input.warningAfterMinutes,
      probablyEndedAfterMinutes: input.probablyEndedAfterMinutes,
      observationStaleAfterMinutes: input.observationStaleAfterMinutes,
      expectedVersion: input.expectedVersion,
      reason: common.resolved.reason,
    });
    const replay = await this.repository.findReplay(common.resolved.idempotencyKey);
    if (replay !== null) {
      return matchesReplay(replay, "policy", common.resolved.entityId, fingerprint)
        ? {
            ok: true,
            policy: replay.snapshot as ProjectResumePolicySnapshot,
            audit: audit(
              common.resolved,
              "policy",
              null,
              replay.snapshot as ProjectResumePolicySnapshot,
            ),
            duplicate: true,
          }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }

    const current = await this.repository.findPolicy(projectId, repositoryId);
    if (!expectedVersionMatches(current, input.expectedVersion)) {
      return { ok: false, code: "STALE_STATE" };
    }
    const snapshot: ProjectResumePolicySnapshot = {
      id: common.resolved.entityId,
      projectId,
      repositoryId,
      warningAfterMinutes: input.warningAfterMinutes,
      probablyEndedAfterMinutes: input.probablyEndedAfterMinutes,
      observationStaleAfterMinutes: input.observationStaleAfterMinutes,
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? common.resolved.now,
      updatedAt: common.resolved.now,
    };
    const event = audit(common.resolved, "policy", current, snapshot);
    const stored = await this.repository.savePolicy(snapshot, event, fingerprint);
    if (stored.status === "conflict") return { ok: false, code: "CONFLICT" };
    if (stored.status === "duplicate") {
      return stored.intentFingerprint === fingerprint
        ? { ok: true, policy: stored.snapshot, audit: event, duplicate: true }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }
    return { ok: true, policy: stored.snapshot, audit: event, duplicate: false };
  }

  async saveTarget(
    input: SaveAiResumeTargetInput,
    context: ResumeConfigurationContext,
  ): Promise<SaveTargetResult> {
    const common = validateCommon(input, context);
    const errors = common.errors;
    const projectId = normalizedNullableId(input.projectId, "PROJECT_ID_INVALID", errors);
    const label = input.label.trim();
    if (label.length === 0) errors.push("TARGET_LABEL_REQUIRED");
    else if (label.length > 100) errors.push("TARGET_LABEL_TOO_LONG");
    if (!providerKinds.has(input.providerKind)) errors.push("TARGET_PROVIDER_INVALID");
    const url = safeLaunchUrl(input.launchUrl);
    if (url.error !== null) errors.push(url.error);
    if (input.deepLinkTemplate !== null) errors.push("TARGET_DEEP_LINK_UNSUPPORTED");
    if (input.isDefault && !input.enabled) errors.push("TARGET_DEFAULT_REQUIRES_ENABLED");
    if (errors.length > 0 || common.resolved.now === null || url.normalized === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const fingerprint = intentFingerprint("target", {
      actorId: common.resolved.actorId,
      entityId: common.resolved.entityId,
      projectId,
      label,
      providerKind: input.providerKind,
      launchUrl: url.normalized,
      deepLinkTemplate: null,
      enabled: input.enabled,
      isDefault: input.isDefault,
      expectedVersion: input.expectedVersion,
      reason: common.resolved.reason,
    });
    const replay = await this.repository.findReplay(common.resolved.idempotencyKey);
    if (replay !== null) {
      return matchesReplay(replay, "target", common.resolved.entityId, fingerprint)
        ? {
            ok: true,
            target: replay.snapshot as AiResumeTarget,
            audit: audit(common.resolved, "target", null, replay.snapshot as AiResumeTarget),
            duplicate: true,
          }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }

    const current = await this.repository.findTarget(common.resolved.entityId);
    if (!expectedVersionMatches(current, input.expectedVersion)) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (input.enabled && input.isDefault) {
      const targets = await this.repository.listTargets(projectId);
      if (
        targets.some(
          (target) =>
            target.id !== common.resolved.entityId && target.enabled && target.isDefault,
        )
      ) {
        return { ok: false, code: "DEFAULT_TARGET_EXISTS" };
      }
    }

    const snapshot: AiResumeTarget = {
      id: common.resolved.entityId,
      projectId,
      label,
      providerKind: input.providerKind,
      launchUrl: url.normalized,
      deepLinkTemplate: null,
      enabled: input.enabled,
      isDefault: input.isDefault,
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? common.resolved.now,
      updatedAt: common.resolved.now,
    };
    const event = audit(common.resolved, "target", current, snapshot);
    const stored = await this.repository.saveTarget(snapshot, event, fingerprint);
    if (stored.status === "conflict") return { ok: false, code: "CONFLICT" };
    if (stored.status === "duplicate") {
      return stored.intentFingerprint === fingerprint
        ? { ok: true, target: stored.snapshot, audit: event, duplicate: true }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }
    return { ok: true, target: stored.snapshot, audit: event, duplicate: false };
  }

  async saveTemplate(
    input: SaveResumePromptTemplateInput,
    context: ResumeConfigurationContext,
  ): Promise<SaveTemplateResult> {
    const common = validateCommon(input, context);
    const errors = common.errors;
    const projectId = normalizedNullableId(input.projectId, "PROJECT_ID_INVALID", errors);
    const name = input.name.trim();
    const template = input.template.trim();
    if (name.length === 0) errors.push("TEMPLATE_NAME_REQUIRED");
    else if (name.length > 100) errors.push("TEMPLATE_NAME_TOO_LONG");
    if (template.length === 0) errors.push("TEMPLATE_REQUIRED");
    else if (template.length > 12_000) errors.push("TEMPLATE_TOO_LONG");
    if (input.isDefault && !input.enabled) errors.push("TEMPLATE_DEFAULT_REQUIRES_ENABLED");

    const placeholderPattern = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gu;
    const placeholders = [...template.matchAll(placeholderPattern)].map((match) => match[1]!);
    for (const placeholder of [...new Set(placeholders)]) {
      if (!allowedPlaceholders.has(placeholder)) {
        errors.push(`TEMPLATE_PLACEHOLDER_UNSUPPORTED:${placeholder}`);
      }
    }
    const stripped = template.replace(placeholderPattern, "");
    if (stripped.includes("{{") || stripped.includes("}}")) {
      errors.push("TEMPLATE_SYNTAX_INVALID");
    }
    if (errors.length > 0 || common.resolved.now === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const fingerprint = intentFingerprint("template", {
      actorId: common.resolved.actorId,
      entityId: common.resolved.entityId,
      projectId,
      name,
      template,
      enabled: input.enabled,
      isDefault: input.isDefault,
      expectedVersion: input.expectedVersion,
      reason: common.resolved.reason,
    });
    const replay = await this.repository.findReplay(common.resolved.idempotencyKey);
    if (replay !== null) {
      return matchesReplay(replay, "template", common.resolved.entityId, fingerprint)
        ? {
            ok: true,
            template: replay.snapshot as ResumePromptTemplate,
            audit: audit(
              common.resolved,
              "template",
              null,
              replay.snapshot as ResumePromptTemplate,
            ),
            duplicate: true,
          }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }

    const current = await this.repository.findTemplate(common.resolved.entityId);
    if (!expectedVersionMatches(current, input.expectedVersion)) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (input.enabled && input.isDefault) {
      const templates = await this.repository.listTemplates(projectId);
      if (
        templates.some(
          (item) => item.id !== common.resolved.entityId && item.enabled && item.isDefault,
        )
      ) {
        return { ok: false, code: "DEFAULT_TEMPLATE_EXISTS" };
      }
    }

    const snapshot: ResumePromptTemplate = {
      id: common.resolved.entityId,
      projectId,
      name,
      template,
      enabled: input.enabled,
      isDefault: input.isDefault,
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? common.resolved.now,
      updatedAt: common.resolved.now,
    };
    const event = audit(common.resolved, "template", current, snapshot);
    const stored = await this.repository.saveTemplate(snapshot, event, fingerprint);
    if (stored.status === "conflict") return { ok: false, code: "CONFLICT" };
    if (stored.status === "duplicate") {
      return stored.intentFingerprint === fingerprint
        ? { ok: true, template: stored.snapshot, audit: event, duplicate: true }
        : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }
    return { ok: true, template: stored.snapshot, audit: event, duplicate: false };
  }
}
