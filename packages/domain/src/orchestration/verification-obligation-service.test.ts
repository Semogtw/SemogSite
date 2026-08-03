import { describe, expect, it } from "vitest";
import {
  VerificationObligationService,
  normalizeVerificationFailureSignature,
  type VerificationObligationAuditEvent,
  type VerificationObligationRepository,
  type VerificationObligationSnapshot,
  type VerificationObligationStoreResult,
} from "./verification-obligation-service";

class MemoryRepository implements VerificationObligationRepository {
  obligations = new Map<string, VerificationObligationSnapshot>();
  audits: VerificationObligationAuditEvent[] = [];
  createResult: VerificationObligationStoreResult = "created";
  updateResult: VerificationObligationStoreResult = "updated";

  async findById(id: string): Promise<VerificationObligationSnapshot | null> {
    return this.obligations.get(id) ?? null;
  }

  async create(
    obligation: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
    if (this.createResult === "created") {
      this.obligations.set(obligation.id, obligation);
      this.audits.push(audit);
    }
    return this.createResult;
  }

  async update(
    before: VerificationObligationSnapshot,
    after: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
    if (this.updateResult === "updated") {
      const current = this.obligations.get(before.id);
      if (current?.version !== before.version) return "conflict";
      this.obligations.set(after.id, after);
      this.audits.push(audit);
    }
    return this.updateResult;
  }
}

const sha = "a".repeat(40);
const context = {
  actorId: "owner-1",
  obligationId: "verification-1",
  auditId: "audit-verification-1",
  idempotencyKey: "verification-attempt-1",
  correlationId: "verification-correlation-1",
  now: "2026-08-03T09:00:00.000Z",
};

const createInput = {
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "run-1",
  stageId: "stage-1",
  branch: "develop/workflow-control-core",
  targetCommitSha: sha,
  gateName: "Domain typecheck",
  command: "pnpm --filter @semogtw/domain typecheck",
  requiredCapabilities: ["node-22", "pnpm-10", "linux-x64"],
  responsibleActor: "agent-a",
  nextAction: "Run the gate in a dependency-complete environment.",
  toolchainManifest: "semogsite-toolchain-linux-x64@2026-08-03",
};

function pending(
  overrides: Partial<VerificationObligationSnapshot> = {},
): VerificationObligationSnapshot {
  return {
    id: "verification-1",
    projectId: "project-1",
    repositoryId: "repository-1",
    runId: "run-1",
    stageId: "stage-1",
    branch: "develop/workflow-control-core",
    targetCommitSha: sha,
    gateName: "Domain typecheck",
    command: "pnpm --filter @semogtw/domain typecheck",
    requiredCapabilities: ["linux-x64", "node-22", "pnpm-10"],
    responsibleActor: "agent-a",
    nextAction: "Run the gate in a dependency-complete environment.",
    toolchainManifest: "semogsite-toolchain-linux-x64@2026-08-03",
    status: "pending",
    failureClassification: null,
    failureSignature: null,
    resultSummary: null,
    evidenceUrls: [],
    createdAt: "2026-08-03T09:00:00.000Z",
    lastAttemptAt: null,
    resolvedAt: null,
    version: 1,
    ...overrides,
  };
}

describe("normalizeVerificationFailureSignature", () => {
  it("groups equivalent sanitized failures deterministically", () => {
    expect(
      normalizeVerificationFailureSignature({
        gateName: " Domain typecheck ",
        classification: "code_failure",
        summary: "TS2322 at /tmp/worktree/packages/domain/src/file.ts:42:9",
      }),
    ).toBe(
      normalizeVerificationFailureSignature({
        gateName: "domain TYPECHECK",
        classification: "code_failure",
        summary: "TS2322 at /home/runner/work/repo/packages/domain/src/file.ts:77:2",
      }),
    );
  });
});

describe("VerificationObligationService.create", () => {
  it("binds a pending gate to an exact normalized branch and commit", async () => {
    const repository = new MemoryRepository();
    const service = new VerificationObligationService(repository);

    const result = await service.create(createInput, context);

    expect(result).toEqual({
      ok: true,
      obligation: pending(),
      audit: expect.objectContaining({
        action: "verification_obligation.create",
        before: null,
        after: pending(),
      }),
    });
  });

  it("rejects abbreviated SHAs, unsafe branches and empty capability sets", async () => {
    const repository = new MemoryRepository();
    const service = new VerificationObligationService(repository);

    const result = await service.create(
      {
        ...createInput,
        branch: "../unsafe",
        targetCommitSha: "abc123",
        requiredCapabilities: [],
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: expect.arrayContaining([
        "BRANCH_INVALID",
        "TARGET_COMMIT_SHA_INVALID",
        "CAPABILITIES_REQUIRED",
      ]),
    });
  });
});

describe("VerificationObligationService.recordResult", () => {
  it("records a passed gate without a failure classification", async () => {
    const repository = new MemoryRepository();
    repository.obligations.set("verification-1", pending());
    const service = new VerificationObligationService(repository);

    const result = await service.recordResult(
      {
        obligationId: "verification-1",
        expectedVersion: 1,
        outcome: "passed",
        failureClassification: null,
        resultSummary: "TypeScript completed with zero errors.",
        evidenceUrls: ["https://github.com/Semogtw/SemogSite/actions/runs/123"],
        nextAction: "Continue the next implementation slice.",
      },
      { ...context, now: "2026-08-03T09:30:00.000Z" },
    );

    expect(result).toMatchObject({
      ok: true,
      obligation: {
        status: "passed",
        failureClassification: null,
        failureSignature: null,
        lastAttemptAt: "2026-08-03T09:30:00.000Z",
        resolvedAt: "2026-08-03T09:30:00.000Z",
        version: 2,
      },
      audit: { action: "verification_obligation.result" },
    });
  });

  it("preserves environment absence separately from code failure", async () => {
    const repository = new MemoryRepository();
    repository.obligations.set("verification-1", pending());
    const service = new VerificationObligationService(repository);

    const result = await service.recordResult(
      {
        obligationId: "verification-1",
        expectedVersion: 1,
        outcome: "blocked",
        failureClassification: "environment_missing",
        resultSummary: "Android SDK is not installed in this runtime.",
        evidenceUrls: [],
        nextAction: "Run on the local Android-capable machine.",
      },
      { ...context, now: "2026-08-03T09:20:00.000Z" },
    );

    expect(result).toMatchObject({
      ok: true,
      obligation: {
        status: "blocked",
        failureClassification: "environment_missing",
        failureSignature: expect.stringContaining("environment_missing"),
        resolvedAt: null,
      },
    });
  });

  it("rejects a failure without classification and a pass with classification", async () => {
    const repository = new MemoryRepository();
    repository.obligations.set("verification-1", pending());
    const service = new VerificationObligationService(repository);

    await expect(
      service.recordResult(
        {
          obligationId: "verification-1",
          expectedVersion: 1,
          outcome: "failed",
          failureClassification: null,
          resultSummary: "Typecheck failed.",
          evidenceUrls: [],
          nextAction: "Fix the type error.",
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["FAILURE_CLASSIFICATION_REQUIRED"],
    });

    await expect(
      service.recordResult(
        {
          obligationId: "verification-1",
          expectedVersion: 1,
          outcome: "passed",
          failureClassification: "code_failure",
          resultSummary: "Passed.",
          evidenceUrls: [],
          nextAction: "Continue.",
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["PASS_CLASSIFICATION_FORBIDDEN"],
    });
  });
});

describe("VerificationObligationService terminal owner decisions", () => {
  it("supersedes a gate for an obsolete SHA", async () => {
    const repository = new MemoryRepository();
    repository.obligations.set("verification-1", pending());
    const service = new VerificationObligationService(repository);

    const result = await service.supersede(
      {
        obligationId: "verification-1",
        expectedVersion: 1,
        reason: "A newer commit changes the files covered by this gate.",
      },
      { ...context, now: "2026-08-03T10:00:00.000Z" },
    );

    expect(result).toMatchObject({
      ok: true,
      obligation: {
        status: "superseded",
        resolvedAt: "2026-08-03T10:00:00.000Z",
        version: 2,
      },
      audit: { action: "verification_obligation.supersede" },
    });
  });

  it("requires explicit confirmation and reason to waive", async () => {
    const repository = new MemoryRepository();
    repository.obligations.set("verification-1", pending());
    const service = new VerificationObligationService(repository);

    await expect(
      service.waive(
        {
          obligationId: "verification-1",
          expectedVersion: 1,
          reason: "Owner accepts this release risk.",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED"],
    });

    const waived = await service.waive(
      {
        obligationId: "verification-1",
        expectedVersion: 1,
        reason: "Owner accepts this release risk.",
        confirmed: true,
      },
      { ...context, now: "2026-08-03T10:10:00.000Z" },
    );
    expect(waived).toMatchObject({
      ok: true,
      obligation: { status: "waived", version: 2 },
      audit: {
        action: "verification_obligation.waive",
        confirmed: true,
      },
    });
  });
});
