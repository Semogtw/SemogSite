import { describe, expect, it, vi } from "vitest";
import {
  CooperativeRunCommandInboxService,
  type CooperativeRunCommandInboxRepository,
} from "./run-command-inbox-service";
import type { CooperativeRunCommandLifecycleSnapshot } from "./run-command-transition-service";

const observedAt = "2026-08-01T23:00:00.000Z";

function command(
  id: string,
  queuedAt: string,
  expiresAt: string | null = null,
): CooperativeRunCommandLifecycleSnapshot {
  return {
    id,
    runId: "run-1",
    kind: "request_checkpoint",
    status: "queued",
    summary: `Command ${id}`,
    payload: { include: ["commits"] },
    reason: null,
    queuedBy: "semogtw-owner",
    idempotencyKey: `key-${id}`,
    correlationId: `correlation-${id}`,
    queuedAt,
    acknowledgedAt: null,
    completedAt: null,
    expiresAt,
    updatedAt: queuedAt,
  };
}

function repository(): CooperativeRunCommandInboxRepository {
  return {
    listPending: vi.fn().mockResolvedValue([
      command("command-1", "2026-08-01T22:00:00.000Z"),
      command(
        "command-2",
        "2026-08-01T22:30:00.000Z",
        "2026-08-02T00:00:00.000Z",
      ),
    ]),
  };
}

describe("CooperativeRunCommandInboxService", () => {
  it("returns a bounded FIFO inbox without acknowledging commands", async () => {
    const store = repository();
    const service = new CooperativeRunCommandInboxService(store);

    await expect(
      service.list({ runId: " run-1 ", observedAt, limit: 10 }),
    ).resolves.toEqual({
      ok: true,
      observedAt,
      commands: [
        expect.objectContaining({ id: "command-1", status: "queued" }),
        expect.objectContaining({ id: "command-2", status: "queued" }),
      ],
    });
    expect(store.listPending).toHaveBeenCalledWith({
      runId: "run-1",
      observedAt,
      limit: 10,
    });
  });

  it("normalizes limits and rejects invalid input before storage", async () => {
    const store = repository();
    const service = new CooperativeRunCommandInboxService(store);

    await expect(
      service.list({ runId: "run-1", observedAt, limit: 999 }),
    ).resolves.toMatchObject({ ok: true });
    expect(store.listPending).toHaveBeenLastCalledWith({
      runId: "run-1",
      observedAt,
      limit: 20,
    });

    await expect(
      service.list({ runId: "", observedAt: "invalid", limit: 0 }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["RUN_ID_REQUIRED", "OBSERVED_AT_INVALID", "LIMIT_INVALID"],
    });
    expect(store.listPending).toHaveBeenCalledTimes(1);
  });

  it("fails closed if a repository returns non-queued, wrong-run or expired data", async () => {
    const store = repository();
    vi.mocked(store.listPending).mockResolvedValue([
      { ...command("wrong-run", observedAt), runId: "run-2" },
      { ...command("acknowledged", observedAt), status: "acknowledged", acknowledgedAt: observedAt },
      command("expired", observedAt, observedAt),
    ]);

    await expect(
      new CooperativeRunCommandInboxService(store).list({
        runId: "run-1",
        observedAt,
        limit: 10,
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REPOSITORY_RESULT" });
  });
});
