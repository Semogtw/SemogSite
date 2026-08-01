import { describe, expect, it, vi } from "vitest";
import {
  CooperativeRunCommandQueueService,
  type CooperativeRunCommandQueueRepository,
} from "./run-command-queue-service";
import type { CooperativeRunSnapshot } from "./run-state";

const now = "2026-08-01T22:00:00.000Z";

function running(): CooperativeRunSnapshot {
  return {
    id: "run-1",
    projectId: "demo-project-platform",
    title: "Foundation implementation",
    actorLabel: "ChatGPT",
    origin: "chatgpt",
    status: "running",
    phase: "Run ledger",
    progress: 60,
    branch: "develop/foundation-bootstrap",
    summary: "Checkpoint persistence complete.",
    blocker: null,
    nextAction: "Queue owner commands.",
    startedAt: "2026-08-01T20:00:00.000Z",
    lastHeartbeatAt: "2026-08-01T21:30:00.000Z",
    finishedAt: null,
    staleAfterSeconds: 3_600,
    updatedAt: "2026-08-01T21:30:00.000Z",
  };
}

function repository(
  run: CooperativeRunSnapshot | null = running(),
): CooperativeRunCommandQueueRepository {
  return {
    findRun: vi.fn().mockResolvedValue(run),
    queue: vi.fn().mockResolvedValue("queued"),
  };
}

const context = {
  actorId: "semogtw-owner",
  commandId: "command-1",
  eventId: "event-command-1",
  idempotencyKey: "command-key-1",
  correlationId: "correlation-command-1",
  source: "manual" as const,
  now,
};

describe("CooperativeRunCommandQueueService", () => {
  it("normalizes an allowlisted command and produces an immutable queue event", async () => {
    const store = repository();
    const service = new CooperativeRunCommandQueueService(store);

    const result = await service.queue(
      {
        runId: " run-1 ",
        kind: "reprioritize",
        summary: "  Priorize o gate de banco.  ",
        payload: {
          priority: "high",
          note: "  Termine o checkpoint antes da UI.  ",
        },
        expiresAt: "2026-08-02T02:00:00-03:00",
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      command: {
        id: "command-1",
        runId: "run-1",
        kind: "reprioritize",
        status: "queued",
        summary: "Priorize o gate de banco.",
        payload: {
          priority: "high",
          note: "Termine o checkpoint antes da UI.",
        },
        reason: null,
        queuedBy: "semogtw-owner",
        idempotencyKey: "command-key-1",
        correlationId: "correlation-command-1",
        queuedAt: now,
        acknowledgedAt: null,
        completedAt: null,
        expiresAt: "2026-08-02T05:00:00.000Z",
        updatedAt: now,
      },
      event: expect.objectContaining({
        id: "event-command-1",
        runId: "run-1",
        kind: "run.command_queued",
        actor: "semogtw-owner",
        source: "manual",
        summary: "Priorize o gate de banco.",
        occurredAt: now,
        idempotencyKey: "command-key-1",
        correlationId: "correlation-command-1",
      }),
    });
    expect(store.queue).toHaveBeenCalledWith(
      running(),
      expect.objectContaining({ id: "command-1" }),
      expect.objectContaining({ id: "event-command-1" }),
    );
  });

  it.each([
    ["continue", { unexpected: true }],
    ["pause", {}],
    ["cancel", { reason: "" }],
    ["reprioritize", { priority: "urgent" }],
    ["request_checkpoint", { include: ["raw_logs"] }],
    ["provide_context", { context: "" }],
    ["provide_context", { accessToken: "secret", context: "safe" }],
  ] as const)("rejects invalid %s payload before reading storage", async (kind, payload) => {
    const store = repository();
    const service = new CooperativeRunCommandQueueService(store);

    const result = await service.queue(
      {
        runId: "run-1",
        kind,
        summary: "Command summary.",
        payload,
        expiresAt: null,
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(store.findRun).not.toHaveBeenCalled();
    expect(store.queue).not.toHaveBeenCalled();
  });

  it("rejects past or excessively distant expiration", async () => {
    const store = repository();
    const service = new CooperativeRunCommandQueueService(store);

    await expect(
      service.queue(
        {
          runId: "run-1",
          kind: "request_checkpoint",
          summary: "Checkpoint now.",
          payload: { include: ["commits", "tests"] },
          expiresAt: "2026-08-01T21:59:59.000Z",
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: expect.arrayContaining(["EXPIRES_AT_INVALID"]),
    });
    await expect(
      service.queue(
        {
          runId: "run-1",
          kind: "request_checkpoint",
          summary: "Checkpoint later.",
          payload: {},
          expiresAt: "2026-09-02T22:00:00.000Z",
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: expect.arrayContaining(["EXPIRES_AT_TOO_FAR"]),
    });
  });

  it("does not queue commands for missing or terminal runs", async () => {
    const missing = repository(null);
    await expect(
      new CooperativeRunCommandQueueService(missing).queue(
        {
          runId: "run-1",
          kind: "continue",
          summary: "Continue.",
          payload: {},
          expiresAt: null,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "RUN_NOT_FOUND" });

    const terminal = repository({
      ...running(),
      status: "completed",
      progress: 100,
      nextAction: null,
      finishedAt: now,
      updatedAt: now,
    });
    await expect(
      new CooperativeRunCommandQueueService(terminal).queue(
        {
          runId: "run-1",
          kind: "continue",
          summary: "Continue.",
          payload: {},
          expiresAt: null,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "TERMINAL_RUN" });
  });

  it.each([
    ["duplicate", "DUPLICATE"],
    ["conflict", "CONFLICT"],
  ] as const)("maps repository %s", async (stored, code) => {
    const store = repository();
    vi.mocked(store.queue).mockResolvedValue(stored);

    await expect(
      new CooperativeRunCommandQueueService(store).queue(
        {
          runId: "run-1",
          kind: "continue",
          summary: "Continue.",
          payload: { note: "Keep going." },
          expiresAt: null,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code });
  });
});
