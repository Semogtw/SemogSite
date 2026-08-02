import { describe, expect, it } from "vitest";
import {
  StageCompletionService,
  type StageCompletionAuditEvent,
  type StageCompletionRepository,
} from "./stage-completion-service";
import type { StageSnapshot } from "./stage";

const before: StageSnapshot = {
  id: "stage-1",
  projectId: "project-1",
  title: "Validar fundação",
  state: "in_progress",
  progress: 80,
  done: false,
  nextStep: "Executar os testes finais.",
  blocker: null,
  evidence: [{ id: "evidence-1", status: "passed" }],
  manualLock: false,
  updatedAt: "2026-08-01T16:00:00.000Z",
};

const context = {
  actorId: "semogtw-owner",
  auditId: "audit-stage-1",
  correlationId: "correlation-stage-1",
  now: "2026-08-01T17:30:00.000Z",
};

class RecordingRepository implements StageCompletionRepository {
  constructor(
    private readonly snapshot: StageSnapshot | null = before,
    private readonly transitioned = true,
  ) {}

  calls: Array<{
    before: StageSnapshot;
    after: StageSnapshot;
    audit: StageCompletionAuditEvent;
  }> = [];

  async findById(): Promise<StageSnapshot | null> {
    return this.snapshot;
  }

  async completeWithAudit(
    previous: StageSnapshot,
    after: StageSnapshot,
    audit: StageCompletionAuditEvent,
  ): Promise<boolean> {
    this.calls.push({ before: previous, after, audit });
    return this.transitioned;
  }
}

describe("StageCompletionService", () => {
  it("completes a stage with valid evidence and records the audit transition", async () => {
    const repository = new RecordingRepository();
    const service = new StageCompletionService(repository);

    const result = await service.complete(
      {
        stageId: before.id,
        reason: "Gate final observado e evidência anexada.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      stage: {
        ...before,
        state: "completed",
        progress: 100,
        done: true,
        nextStep: null,
        blocker: null,
        manualLock: true,
        updatedAt: context.now,
      },
      audit: {
        id: "audit-stage-1",
        actor: "semogtw-owner",
        action: "stage.complete",
        entityType: "stage",
        entityId: before.id,
        before,
        after: expect.any(Object),
        reason: "Gate final observado e evidência anexada.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-stage-1",
      },
    });
    expect(repository.calls).toEqual(
      result.ok
        ? [{ before, after: result.stage, audit: result.audit }]
        : expect.unreachable(),
    );
  });

  it("rejects completion without valid evidence", async () => {
    const repository = new RecordingRepository({
      ...before,
      evidence: [{ id: "evidence-failed", status: "failed" }],
    });
    const service = new StageCompletionService(repository);

    const result = await service.complete(
      {
        stageId: before.id,
        reason: "Tentativa sem gate válido.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      code: "INVARIANT_FAILED",
      errors: ["EVIDENCE_REQUIRED"],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("rejects missing confirmation and reason before reading storage", async () => {
    const repository = new RecordingRepository();
    const service = new StageCompletionService(repository);

    const result = await service.complete(
      { stageId: " ", reason: " ", confirmed: false },
      context,
    );

    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "CONFIRMATION_REQUIRED",
        "STAGE_ID_REQUIRED",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("does not complete a missing or already completed stage", async () => {
    const missing = new StageCompletionService(new RecordingRepository(null));
    await expect(
      missing.complete(
        {
          stageId: "missing",
          reason: "Registro inexistente.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });

    const completed = new StageCompletionService(
      new RecordingRepository({
        ...before,
        state: "completed",
        progress: 100,
        done: true,
        nextStep: null,
      }),
    );
    await expect(
      completed.complete(
        {
          stageId: before.id,
          reason: "Tentativa repetida.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "ALREADY_COMPLETED" });
  });

  it("reports an optimistic conflict without claiming completion", async () => {
    const repository = new RecordingRepository(before, false);
    const service = new StageCompletionService(repository);

    await expect(
      service.complete(
        {
          stageId: before.id,
          reason: "Finalizar etapa.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
