import { describe, expect, it } from "vitest";
import type {
  VerificationObligationAuditEvent,
  VerificationObligationSnapshot,
} from "@semogtw/domain/orchestration";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteVerificationObligationRepository } from "./verification-obligation-repository";

const now = "2026-08-03T09:00:00.000Z";
const sha = "a".repeat(40);

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      "Semogtw",
      "SemogSite",
      "Semogtw/SemogSite",
      "product",
      "private",
      "active",
      "main",
      "develop/workflow-control-core",
      "https://github.com/Semogtw/SemogSite",
      "manual",
      now,
      now,
    );
}

function obligation(
  overrides: Partial<VerificationObligationSnapshot> = {},
): VerificationObligationSnapshot {
  return {
    id: "verification-1",
    projectId: "demo-project-platform",
    repositoryId: "repository-1",
    runId: null,
    stageId: null,
    branch: "develop/workflow-control-core",
    targetCommitSha: sha,
    gateName: "Domain typecheck",
    command: "pnpm --filter @semogtw/domain typecheck",
    requiredCapabilities: ["linux-x64", "node-22", "pnpm-10"],
    responsibleActor: "agent-a",
    nextAction: "Run the gate in a dependency-complete environment.",
    toolchainManifest: null,
    status: "pending",
    failureClassification: null,
    failureSignature: null,
    resultSummary: null,
    evidenceUrls: [],
    createdAt: now,
    lastAttemptAt: null,
    resolvedAt: null,
    version: 1,
    ...overrides,
  };
}

function audit(
  after: VerificationObligationSnapshot,
  overrides: Partial<VerificationObligationAuditEvent> = {},
): VerificationObligationAuditEvent {
  return {
    id: "audit-verification-1",
    actor: "owner-1",
    action: "verification_obligation.create",
    entityType: "verification_obligation",
    entityId: after.id,
    before: null,
    after,
    reason: `Create required gate: ${after.gateName}`,
    occurredAt: now,
    source: "agent",
    confirmed: false,
    idempotencyKey: "verification-attempt-1",
    correlationId: "verification-correlation-1",
    ...overrides,
  };
}

describe("SqliteVerificationObligationRepository", () => {
  it("creates an exact-SHA obligation with event and global audit atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteVerificationObligationRepository(database);
    const value = obligation();
    const event = audit(value);

    await expect(repository.create(value, event)).resolves.toBe("created");

    expect(
      database.$client
        .prepare(
          `SELECT repository_id, branch, target_commit_sha, gate_name, command,
                  required_capabilities_json, responsible_actor, next_action,
                  status, failure_classification, failure_signature,
                  evidence_urls_json, version
           FROM verification_obligations WHERE id = ?`,
        )
        .get(value.id),
    ).toEqual({
      repository_id: "repository-1",
      branch: value.branch,
      target_commit_sha: sha,
      gate_name: value.gateName,
      command: value.command,
      required_capabilities_json: JSON.stringify(value.requiredCapabilities),
      responsible_actor: "agent-a",
      next_action: value.nextAction,
      status: "pending",
      failure_classification: null,
      failure_signature: null,
      evidence_urls_json: "[]",
      version: 1,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, action, actor, before_json, after_json,
                  idempotency_key, correlation_id
           FROM verification_obligation_events WHERE obligation_id = ?`,
        )
        .get(value.id),
    ).toEqual({
      sequence: 1,
      action: "verification_obligation.create",
      actor: "owner-1",
      before_json: null,
      after_json: JSON.stringify(value),
      idempotency_key: "verification-attempt-1",
      correlation_id: "verification-correlation-1",
    });
    expect(
      database.$client
        .prepare(
          "SELECT action, entity_type, entity_id FROM audit_events WHERE id = ?",
        )
        .get(event.id),
    ).toEqual({
      action: "verification_obligation.create",
      entity_type: "verification_obligation",
      entity_id: value.id,
    });
    database.$client.close();
  });

  it("deduplicates stable create intent and rejects changed command reuse", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteVerificationObligationRepository(database);
    const value = obligation();
    const event = audit(value);

    await repository.create(value, event);
    await expect(repository.create(value, event)).resolves.toBe("duplicate");
    await expect(
      repository.create(
        { ...value, command: "pnpm check" },
        { ...event, after: { ...value, command: "pnpm check" } },
      ),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM verification_obligations")
        .get(),
    ).toEqual({ count: 1 });
    database.$client.close();
  });

  it("records a classified result with compare-and-swap and next sequence", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteVerificationObligationRepository(database);
    const before = obligation();
    await repository.create(before, audit(before));

    const attemptedAt = "2026-08-03T09:30:00.000Z";
    const after: VerificationObligationSnapshot = {
      ...before,
      status: "blocked",
      failureClassification: "environment_missing",
      failureSignature:
        "domain typecheck|environment_missing|node modules unavailable",
      resultSummary: "Node modules unavailable.",
      nextAction: "Use the regenerated offline toolchain.",
      lastAttemptAt: attemptedAt,
      version: 2,
    };
    const resultEvent = audit(after, {
      id: "audit-verification-result",
      action: "verification_obligation.result",
      before,
      after,
      reason: after.resultSummary ?? "Blocked",
      occurredAt: attemptedAt,
      idempotencyKey: "verification-result-1",
    });

    await expect(repository.update(before, after, resultEvent)).resolves.toBe(
      "updated",
    );
    await expect(repository.update(before, after, resultEvent)).resolves.toBe(
      "duplicate",
    );
    expect(
      database.$client
        .prepare(
          `SELECT status, failure_classification, failure_signature,
                  result_summary, next_action, last_attempt_at, version
           FROM verification_obligations WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      status: "blocked",
      failure_classification: "environment_missing",
      failure_signature: after.failureSignature,
      result_summary: "Node modules unavailable.",
      next_action: "Use the regenerated offline toolchain.",
      last_attempt_at: attemptedAt,
      version: 2,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, action FROM verification_obligation_events
           WHERE obligation_id = ? ORDER BY sequence ASC`,
        )
        .all(before.id),
    ).toEqual([
      { sequence: 1, action: "verification_obligation.create" },
      { sequence: 2, action: "verification_obligation.result" },
    ]);

    await expect(
      repository.update(
        before,
        { ...after, version: 3 },
        audit({ ...after, version: 3 }, {
          id: "audit-verification-stale",
          action: "verification_obligation.result",
          before,
          after: { ...after, version: 3 },
          idempotencyKey: "verification-result-stale",
        }),
      ),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("reports missing references without partial inserts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteVerificationObligationRepository(database);
    const missingRepository = obligation();

    await expect(
      repository.create(missingRepository, audit(missingRepository)),
    ).resolves.toBe("repository_not_found");

    insertRepository(database);
    const missingStage = obligation({
      id: "verification-stage",
      stageId: "stage-missing",
    });
    await expect(
      repository.create(
        missingStage,
        audit(missingStage, {
          id: "audit-verification-stage",
          entityId: missingStage.id,
          idempotencyKey: "verification-stage-attempt",
        }),
      ),
    ).resolves.toBe("stage_not_found");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM verification_obligations")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });
});
