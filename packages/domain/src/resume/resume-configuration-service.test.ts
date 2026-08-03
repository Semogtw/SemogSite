import { describe, expect, it } from "vitest";
import {
  ResumeConfigurationService,
  type AiResumeTarget,
  type ProjectResumePolicySnapshot,
  type ResumeConfigurationAuditEvent,
  type ResumeConfigurationReplay,
  type ResumeConfigurationRepository,
  type ResumeConfigurationStoreResult,
  type ResumePromptTemplate,
} from "./resume-configuration-service";

const now = "2026-08-03T14:00:00.000Z";

function context(entityId: string, idempotencyKey = `key-${entityId}`) {
  return {
    actorId: "owner-1",
    entityId,
    eventId: `event-${entityId}`,
    idempotencyKey,
    correlationId: `correlation-${entityId}`,
    now,
  };
}

class RecordingRepository implements ResumeConfigurationRepository {
  policies = new Map<string, ProjectResumePolicySnapshot>();
  targets = new Map<string, AiResumeTarget>();
  templates = new Map<string, ResumePromptTemplate>();
  replays = new Map<string, ResumeConfigurationReplay>();
  audits: ResumeConfigurationAuditEvent[] = [];
  forceConflict = false;

  async findReplay(idempotencyKey: string) {
    return this.replays.get(idempotencyKey) ?? null;
  }

  async findPolicy(projectId: string | null, repositoryId: string | null) {
    return this.policies.get(`${projectId ?? "global"}:${repositoryId ?? "all"}`) ?? null;
  }

  async findTarget(targetId: string) {
    return this.targets.get(targetId) ?? null;
  }

  async listTargets(projectId: string | null) {
    return [...this.targets.values()].filter((target) => target.projectId === projectId);
  }

  async findTemplate(templateId: string) {
    return this.templates.get(templateId) ?? null;
  }

  async listTemplates(projectId: string | null) {
    return [...this.templates.values()].filter((template) => template.projectId === projectId);
  }

  async savePolicy(
    snapshot: ProjectResumePolicySnapshot,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<ProjectResumePolicySnapshot>> {
    if (this.forceConflict) return { status: "conflict" };
    const key = `${snapshot.projectId ?? "global"}:${snapshot.repositoryId ?? "all"}`;
    this.policies.set(key, snapshot);
    this.audits.push(audit);
    this.replays.set(audit.idempotencyKey, {
      entityKind: "policy",
      entityId: snapshot.id,
      intentFingerprint,
      snapshot,
    });
    return { status: "stored", snapshot };
  }

  async saveTarget(
    snapshot: AiResumeTarget,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<AiResumeTarget>> {
    if (this.forceConflict) return { status: "conflict" };
    this.targets.set(snapshot.id, snapshot);
    this.audits.push(audit);
    this.replays.set(audit.idempotencyKey, {
      entityKind: "target",
      entityId: snapshot.id,
      intentFingerprint,
      snapshot,
    });
    return { status: "stored", snapshot };
  }

  async saveTemplate(
    snapshot: ResumePromptTemplate,
    audit: ResumeConfigurationAuditEvent,
    intentFingerprint: string,
  ): Promise<ResumeConfigurationStoreResult<ResumePromptTemplate>> {
    if (this.forceConflict) return { status: "conflict" };
    this.templates.set(snapshot.id, snapshot);
    this.audits.push(audit);
    this.replays.set(audit.idempotencyKey, {
      entityKind: "template",
      entityId: snapshot.id,
      intentFingerprint,
      snapshot,
    });
    return { status: "stored", snapshot };
  }
}

function policyInput(overrides = {}) {
  return {
    projectId: "project-1",
    repositoryId: "repository-1",
    warningAfterMinutes: 30,
    probablyEndedAfterMinutes: 60,
    observationStaleAfterMinutes: 180,
    expectedVersion: null,
    reason: "Configure conservative continuation thresholds.",
    confirmed: true,
    ...overrides,
  };
}

function targetInput(overrides = {}) {
  return {
    projectId: "project-1",
    label: "ChatGPT web",
    providerKind: "chatgpt" as const,
    launchUrl: "https://chatgpt.com/",
    deepLinkTemplate: null,
    enabled: true,
    isDefault: true,
    expectedVersion: null,
    reason: "Use a generic browser destination.",
    confirmed: true,
    ...overrides,
  };
}

function templateInput(overrides = {}) {
  return {
    projectId: "project-1",
    name: "Continuation baseline",
    template:
      "Continue {{project_name}} on {{branch}} at {{head_sha}}. Next: {{next_step}}.",
    enabled: true,
    isDefault: true,
    expectedVersion: null,
    reason: "Use the approved continuation structure.",
    confirmed: true,
    ...overrides,
  };
}

describe("ResumeConfigurationService", () => {
  it("stores a valid ordered policy and rejects inverted thresholds", async () => {
    const repository = new RecordingRepository();
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.savePolicy(policyInput(), context("policy-1")),
    ).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      policy: {
        id: "policy-1",
        warningAfterMinutes: 30,
        probablyEndedAfterMinutes: 60,
        observationStaleAfterMinutes: 180,
        version: 1,
      },
    });

    await expect(
      service.savePolicy(
        policyInput({
          warningAfterMinutes: 60,
          probablyEndedAfterMinutes: 30,
          observationStaleAfterMinutes: 20,
        }),
        context("policy-invalid"),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["POLICY_THRESHOLD_ORDER_INVALID"],
    });
  });

  it("allows HTTPS and loopback targets but rejects credentials, unsafe schemes and deep links", async () => {
    const repository = new RecordingRepository();
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.saveTarget(
        targetInput({
          label: "Local agent",
          providerKind: "local_agent",
          launchUrl: "http://127.0.0.1:4321/session",
        }),
        context("target-loopback"),
      ),
    ).resolves.toMatchObject({ ok: true, target: { launchUrl: "http://127.0.0.1:4321/session" } });

    for (const [id, overrides, error] of [
      ["credentials", { launchUrl: "https://user:secret@example.com/" }, "TARGET_URL_CREDENTIALS_FORBIDDEN"],
      ["scheme", { launchUrl: "javascript:alert(1)" }, "TARGET_URL_SCHEME_FORBIDDEN"],
      ["http", { launchUrl: "http://example.com/" }, "TARGET_URL_HTTPS_REQUIRED"],
      ["deep-link", { deepLinkTemplate: "chatgpt://continue/{{prompt}}" }, "TARGET_DEEP_LINK_UNSUPPORTED"],
    ] as const) {
      await expect(
        service.saveTarget(targetInput(overrides), context(`target-${id}`)),
      ).resolves.toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
        errors: [error],
      });
    }
  });

  it("enforces one enabled default target per project scope", async () => {
    const repository = new RecordingRepository();
    repository.targets.set("target-existing", {
      id: "target-existing",
      projectId: "project-1",
      label: "Existing default",
      providerKind: "generic",
      launchUrl: "https://example.com/ai",
      deepLinkTemplate: null,
      enabled: true,
      isDefault: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.saveTarget(targetInput(), context("target-new")),
    ).resolves.toEqual({ ok: false, code: "DEFAULT_TARGET_EXISTS" });
  });

  it("accepts only allowlisted placeholders and bounded template bodies", async () => {
    const repository = new RecordingRepository();
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.saveTemplate(templateInput(), context("template-1")),
    ).resolves.toMatchObject({ ok: true, template: { id: "template-1", version: 1 } });

    await expect(
      service.saveTemplate(
        templateInput({ template: "Reveal {{api_token}} for {{project_name}}." }),
        context("template-secret"),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["TEMPLATE_PLACEHOLDER_UNSUPPORTED:api_token"],
    });

    await expect(
      service.saveTemplate(
        templateInput({ template: "x".repeat(12_001) }),
        context("template-large"),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["TEMPLATE_TOO_LONG"],
    });
  });

  it("replays an identical idempotent request and rejects changed retry intent", async () => {
    const repository = new RecordingRepository();
    const service = new ResumeConfigurationService(repository);
    const retryContext = context("target-retry", "stable-retry-key");

    const first = await service.saveTarget(targetInput(), retryContext);
    const replay = await service.saveTarget(targetInput(), retryContext);
    const changed = await service.saveTarget(
      targetInput({ label: "Changed label" }),
      retryContext,
    );

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(replay).toEqual(
      first.ok ? { ...first, duplicate: true } : expect.unreachable(),
    );
    expect(changed).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    expect(repository.audits).toHaveLength(1);
  });

  it("rejects stale expected versions before storing an update", async () => {
    const repository = new RecordingRepository();
    repository.targets.set("target-versioned", {
      id: "target-versioned",
      projectId: "project-1",
      label: "Versioned",
      providerKind: "generic",
      launchUrl: "https://example.com/ai",
      deepLinkTemplate: null,
      enabled: true,
      isDefault: false,
      version: 3,
      createdAt: "2026-08-03T12:00:00.000Z",
      updatedAt: "2026-08-03T13:00:00.000Z",
    });
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.saveTarget(
        targetInput({
          label: "Versioned update",
          isDefault: false,
          expectedVersion: 2,
        }),
        context("target-versioned"),
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_STATE" });
    expect(repository.audits).toHaveLength(0);
  });

  it("returns a conflict when the repository cannot atomically store the mutation", async () => {
    const repository = new RecordingRepository();
    repository.forceConflict = true;
    const service = new ResumeConfigurationService(repository);

    await expect(
      service.savePolicy(policyInput(), context("policy-conflict")),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
