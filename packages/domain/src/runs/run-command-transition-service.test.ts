import { describe, expect, it, vi } from "vitest";
import {
  CooperativeRunCommandTransitionService,
  type CooperativeRunCommandLifecycleSnapshot,
  type CooperativeRunCommandTransitionRepository,
} from "./run-command-transition-service";

const queuedAt = "2026-08-01T22:00:00.000Z";
const now = "2026-08-01T22:10:00.000Z";

function queued(): CooperativeRunCommandLifecycleSnapshot {
  return {
    id: "command-1",
    runId: "run-1",
    kind: "request_checkpoint",
    status: "queued",
    summary: "Send a checkpoint.",
    payload: { include: ["commits", "tests"] },
    reason: null,
    queuedBy: "semogtw-owner",
    idempotencyKey: "queue-key-1",
    correlationId: "correlation-queue-1",
    queuedAt,
    acknowledgedAt: null,
    completedAt: null,
    expiresAt: "2026-08-02T02:00:00.000Z",
    updatedAt: queuedAt,
  };
}

function repository(
  command: CooperativeRunCommandLifecycleSnapshot | null = queued(),
): CooperativeRunCommandTransitionRepository {
  return {
    findCommand: vi.fn().mockResolvedValue(command),
    apply: vi.fn().mockResolvedValue("updated"),
  };
}

const context = {
  actorId: "chatgpt-agent",
  eventId: "event-command-transition-1",
  idempotencyKey: "transition-key-1",
  correlationId: "correlation-transition-1",
  source: "chatgpt" as const,
  now,
  expectedUpdatedAt: queuedAt,
};

describe("CooperativeRunCommandTransitionService", () => {
  it("acknowledges a queued command without claiming it was applied", async () => {
    const store = repository();
    const service = new CooperativeRunCommandTransitionService(store);

    await expect(
      service.transition(
        {
          runId: " run-1 ",
          commandId: " command-1 ",
          action: { kind: "acknowledge", summary: "  Understood.  " },
        },
        context,
      ),
    ).resolves.toEqual({
      ok: true,
      command: {
        ...queued(),
        status: "acknowledged",
        acknowledgedAt: now,
        updatedAt: now,
      },
      event: expect.objectContaining({
        kind: "run.command_acknowledged",
        actor: "chatgpt-agent",
        summary: "Understood.",
        occurredAt: now,
      }),
    });
  });

  it("completes only an acknowledged command", async () => {
    const before: CooperativeRunCommandLifecycleSnapshot = {
      ...queued(),
      status: "acknowledged",
      acknowledgedAt: "2026-08-01T22:05:00.000Z",
      updatedAt: "2026-08-01T22:05:00.000Z",
    };
    const store = repository(before);

    await expect(
      new CooperativeRunCommandTransitionService(store).transition(
        {
          runId: before.runId,
          commandId: before.id,
          action: { kind: "complete", summary: "Checkpoint recorded." },
        },
        { ...context, expectedUpdatedAt: before.updatedAt },
      ),
    ).resolves.toMatchObject({
      ok: true,
      command: {
        status: "completed",
        acknowledgedAt: before.acknowledgedAt,
        completedAt: now,
        updatedAt: now,
      },
      event: { kind: "run.command_completed" },
    });
  });

  it("rejects queued or acknowledged commands with an explicit reason", async () => {
    const store = repository();

    await expect(
      new CooperativeRunCommandTransitionService(store).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: {
            kind: "reject",
            reason: "  Requires unsafe credentials.  ",
            summary: "  Command rejected safely.  ",
          },
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: true,
      command: {
        status: "rejected",
        reason: "Requires unsafe credentials.",
        completedAt: now,
      },
      event: {
        kind: "run.command_rejected",
        summary: "Command rejected safely.",
      },
    });
  });

  it("rejects stale, invalid and expired transitions before persistence", async () => {
    const staleStore = repository();
    await expect(
      new CooperativeRunCommandTransitionService(staleStore).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: { kind: "acknowledge" },
        },
        { ...context, expectedUpdatedAt: "2026-08-01T21:59:00.000Z" },
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_STATE" });
    expect(staleStore.apply).not.toHaveBeenCalled();

    const expired = repository({
      ...queued(),
      expiresAt: "2026-08-01T22:09:00.000Z",
    });
    await expect(
      new CooperativeRunCommandTransitionService(expired).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: { kind: "acknowledge" },
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "COMMAND_EXPIRED" });

    const invalid = repository();
    await expect(
      new CooperativeRunCommandTransitionService(invalid).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: { kind: "complete", summary: "Not acknowledged." },
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: expect.arrayContaining(["INVALID_TRANSITION"]),
    });
  });

  it("keeps terminal command states immutable", async () => {
    const store = repository({
      ...queued(),
      status: "completed",
      acknowledgedAt: "2026-08-01T22:05:00.000Z",
      completedAt: "2026-08-01T22:06:00.000Z",
      updatedAt: "2026-08-01T22:06:00.000Z",
    });

    await expect(
      new CooperativeRunCommandTransitionService(store).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: { kind: "reject", reason: "Too late." },
        },
        { ...context, expectedUpdatedAt: "2026-08-01T22:06:00.000Z" },
      ),
    ).resolves.toEqual({ ok: false, code: "TERMINAL_COMMAND" });
  });

  it.each([
    ["duplicate", "DUPLICATE"],
    ["conflict", "CONFLICT"],
  ] as const)("maps repository %s", async (stored, code) => {
    const store = repository();
    vi.mocked(store.apply).mockResolvedValue(stored);

    await expect(
      new CooperativeRunCommandTransitionService(store).transition(
        {
          runId: "run-1",
          commandId: "command-1",
          action: { kind: "acknowledge" },
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code });
  });
});
