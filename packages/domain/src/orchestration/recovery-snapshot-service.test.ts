import { describe, expect, it } from "vitest";
import {
  RecoverySnapshotService,
  type RecoverySnapshotAuditEvent,
  type RecoverySnapshotRecord,
  type RecoverySnapshotRepository,
  type RecoverySnapshotStoreResult,
} from "./recovery-snapshot-service";
import type { RecoverySnapshotInput } from "./recovery-snapshot";

class MemoryRepository implements RecoverySnapshotRepository {
  records = new Map<string, RecoverySnapshotRecord>();
  audits: RecoverySnapshotAuditEvent[] = [];
  result: RecoverySnapshotStoreResult = "created";

  async store(
    record: RecoverySnapshotRecord,
    audit: RecoverySnapshotAuditEvent,
  ): Promise<RecoverySnapshotStoreResult> {
    if (this.result === "created") {
      this.records.set(record.snapshot.id, record);
      this.audits.push(audit);
    }
    return this.result;
  }
}

const snapshotInput: RecoverySnapshotInput = {
  snapshotId: "snapshot-1",
  generatedAt: "2026-08-03T12:00:00.000Z",
  sourceObservedAt: "2026-08-03T11:55:00.000Z",
  confidence: "high",
  project: { id: "project-1", slug: "semogsite", name: "SemogSite" },
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    branch: "develop/workflow-control-core",
    observedCommitSha: "a".repeat(40),
  },
  run: null,
  stage: null,
  plan: {
    path: "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
    section: "Task 6",
  },
  commits: [],
  pushState: "confirmed",
  tests: [],
  obligations: [],
  reservations: [],
  blockers: [],
  decisions: ["Remote MCP is optional."],
  nextAction: "Continue the workflow dashboard.",
  requiredDocuments: [],
  runtime: {
    label: "GitHub connector",
    capabilities: ["github-read", "github-write"],
    toolchainManifest: null,
  },
  continuation: {
    templateId: "workflow-resume",
    templateVersion: 1,
    prompt: "Continue from the exact branch and SHA in this snapshot.",
  },
  warnings: [],
};

const context = {
  actorId: "owner-1",
  auditId: "audit-snapshot-1",
  idempotencyKey: "snapshot-attempt-1",
  correlationId: "snapshot-correlation-1",
};

describe("RecoverySnapshotService.create", () => {
  it("builds, hashes and stores one immutable audited snapshot", async () => {
    const repository = new MemoryRepository();
    const service = new RecoverySnapshotService(
      repository,
      () => "b".repeat(64),
    );

    const result = await service.create(snapshotInput, context);

    expect(result).toMatchObject({
      ok: true,
      record: {
        snapshot: { id: "snapshot-1", schemaVersion: 1 },
        canonicalHash: "b".repeat(64),
        canonicalJson: expect.stringContaining('"schemaVersion":1'),
        markdown: expect.stringContaining("# Recovery snapshot — SemogSite"),
      },
      audit: {
        action: "recovery_snapshot.create",
        actor: "owner-1",
        entityId: "snapshot-1",
        before: null,
        confirmed: true,
      },
    });
    expect(repository.records.size).toBe(1);
    expect(repository.audits).toHaveLength(1);
  });

  it("does not call persistence when rendering or hash validation fails", async () => {
    const repository = new MemoryRepository();
    const invalidHashService = new RecoverySnapshotService(
      repository,
      () => "not-a-sha256",
    );

    await expect(
      invalidHashService.create(snapshotInput, context),
    ).resolves.toEqual({
      ok: false,
      code: "HASH_INVALID",
    });
    expect(repository.records.size).toBe(0);

    const service = new RecoverySnapshotService(repository, () => "b".repeat(64));
    const invalidInput = {
      ...snapshotInput,
      repository: { ...snapshotInput.repository, observedCommitSha: "abc" },
    };
    await expect(service.create(invalidInput, context)).resolves.toMatchObject({
      ok: false,
      code: "SNAPSHOT_INVALID",
      errors: ["OBSERVED_COMMIT_SHA_INVALID"],
    });
    expect(repository.records.size).toBe(0);
  });

  it("maps duplicate and conflicting persistence outcomes explicitly", async () => {
    const repository = new MemoryRepository();
    const service = new RecoverySnapshotService(
      repository,
      () => "b".repeat(64),
    );

    repository.result = "duplicate";
    await expect(service.create(snapshotInput, context)).resolves.toEqual({
      ok: false,
      code: "DUPLICATE",
    });

    repository.result = "conflict";
    await expect(service.create(snapshotInput, context)).resolves.toEqual({
      ok: false,
      code: "CONFLICT",
    });
  });
});
