import { describe, expect, it } from "vitest";
import {
  RepositoryTargetLifecycleService,
  type RepositorySyncTargetLifecycleAuditEvent,
  type RepositorySyncTargetLifecycleRepository,
  type RepositorySyncTargetLifecycleSnapshot,
} from "./repository-target-lifecycle-service";

const snapshot: RepositorySyncTargetLifecycleSnapshot = {
  id: "repository-1",
  fullName: "Semogtw/SemogSite",
  syncEnabled: true,
  updatedAt: "2026-08-01T21:00:00.000Z",
};

const context = {
  actorId: "semogtw-owner",
  auditId: "audit-target-lifecycle",
  correlationId: "correlation-target-lifecycle",
  now: "2026-08-01T22:00:00.000Z",
};

class RecordingRepository implements RepositorySyncTargetLifecycleRepository {
  readonly calls: Array<{
    before: RepositorySyncTargetLifecycleSnapshot;
    after: RepositorySyncTargetLifecycleSnapshot;
    audit: RepositorySyncTargetLifecycleAuditEvent;
  }> = [];

  constructor(
    private readonly value: RepositorySyncTargetLifecycleSnapshot | null = snapshot,
    private readonly changed = true,
  ) {}

  async findTarget(): Promise<RepositorySyncTargetLifecycleSnapshot | null> {
    return this.value;
  }

  async changeWithAudit(
    before: RepositorySyncTargetLifecycleSnapshot,
    after: RepositorySyncTargetLifecycleSnapshot,
    audit: RepositorySyncTargetLifecycleAuditEvent,
  ): Promise<boolean> {
    this.calls.push({ before, after, audit });
    return this.changed;
  }
}

describe("RepositoryTargetLifecycleService", () => {
  it("disables a target with an action-specific audit event", async () => {
    const repository = new RecordingRepository();
    const service = new RepositoryTargetLifecycleService(repository);

    const result = await service.change(
      {
        repositoryId: snapshot.id,
        desiredSyncEnabled: false,
        expectedSyncEnabled: true,
        expectedUpdatedAt: snapshot.updatedAt,
        reason: "Pausar observações durante uma migração de repositório.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      target: { ...snapshot, syncEnabled: false, updatedAt: context.now },
      audit: {
        id: context.auditId,
        actor: context.actorId,
        action: "repository.sync_target.disable",
        entityType: "repository",
        entityId: snapshot.id,
        before: snapshot,
        after: { ...snapshot, syncEnabled: false, updatedAt: context.now },
        reason: "Pausar observações durante uma migração de repositório.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: context.correlationId,
      },
    });
    expect(repository.calls).toEqual(
      result.ok
        ? [{ before: snapshot, after: result.target, audit: result.audit }]
        : expect.unreachable(),
    );
  });

  it("enables a paused target", async () => {
    const paused = { ...snapshot, syncEnabled: false };
    const repository = new RecordingRepository(paused);
    const service = new RepositoryTargetLifecycleService(repository);

    await expect(
      service.change(
        {
          repositoryId: paused.id,
          desiredSyncEnabled: true,
          expectedSyncEnabled: false,
          expectedUpdatedAt: paused.updatedAt,
          reason: "Retomar observações após concluir a migração.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: true,
      target: { syncEnabled: true },
      audit: { action: "repository.sync_target.enable" },
    });
  });

  it("rejects missing, stale and already-applied state", async () => {
    const missing = new RepositoryTargetLifecycleService(
      new RecordingRepository(null),
    );
    await expect(
      missing.change(
        {
          repositoryId: "missing",
          desiredSyncEnabled: false,
          expectedSyncEnabled: true,
          expectedUpdatedAt: snapshot.updatedAt,
          reason: "Pausar alvo ausente.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "REPOSITORY_NOT_FOUND" });

    const stale = new RepositoryTargetLifecycleService(
      new RecordingRepository(snapshot),
    );
    await expect(
      stale.change(
        {
          repositoryId: snapshot.id,
          desiredSyncEnabled: false,
          expectedSyncEnabled: false,
          expectedUpdatedAt: "2026-08-01T20:00:00.000Z",
          reason: "Estado antigo.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_STATE" });

    const noOp = new RepositoryTargetLifecycleService(
      new RecordingRepository(snapshot),
    );
    await expect(
      noOp.change(
        {
          repositoryId: snapshot.id,
          desiredSyncEnabled: true,
          expectedSyncEnabled: true,
          expectedUpdatedAt: snapshot.updatedAt,
          reason: "Já habilitado.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "ALREADY_APPLIED" });
  });

  it("validates identifiers, timestamp, reason and confirmation", async () => {
    const repository = new RecordingRepository();
    const service = new RepositoryTargetLifecycleService(repository);

    await expect(
      service.change(
        {
          repositoryId: " ",
          desiredSyncEnabled: false,
          expectedSyncEnabled: true,
          expectedUpdatedAt: "not-a-date",
          reason: " ",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "CONFIRMATION_REQUIRED",
        "REPOSITORY_ID_REQUIRED",
        "EXPECTED_UPDATED_AT_INVALID",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("reports an optimistic conflict without claiming a change", async () => {
    const repository = new RecordingRepository(snapshot, false);
    const service = new RepositoryTargetLifecycleService(repository);

    await expect(
      service.change(
        {
          repositoryId: snapshot.id,
          desiredSyncEnabled: false,
          expectedSyncEnabled: true,
          expectedUpdatedAt: snapshot.updatedAt,
          reason: "Pausar observações.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
