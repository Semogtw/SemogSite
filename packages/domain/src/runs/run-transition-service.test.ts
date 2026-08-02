import { describe, expect, it } from "vitest";
import type { CooperativeRunSnapshot } from "./run-state";
import {
  CooperativeRunTransitionService,
  type CooperativeRunEvent,
  type CooperativeRunTransitionRepository,
} from "./run-transition-service";

const running: CooperativeRunSnapshot = {
  id: "run-1",
  projectId: "project-1",
  title: "Foundation implementation",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "MCP hardening",
  progress: 40,
  branch: "develop/foundation-bootstrap",
  summary: "Read adapter implemented.",
  blocker: null,
  nextAction: "Run dependency-complete tests.",
  startedAt: "2026-08-01T18:00:00.000Z",
  lastHeartbeatAt: "2026-08-01T20:00:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 3_600,
  updatedAt: "2026-08-01T20:00:00.000Z",
};

const context = {
  actorId: "semogtw-owner",
  eventId: "run-event-2",
  idempotencyKey: "run-1-checkpoint-2",
  correlationId: "correlation-run-1-checkpoint-2",
  source: "manual" as const,
  now: "2026-08-01T20:30:00.000Z",
  expectedUpdatedAt: running.updatedAt,
};

class RecordingRepository implements CooperativeRunTransitionRepository {
  events: CooperativeRunEvent[] = [];
  transitions: Array<{
    before: CooperativeRunSnapshot;
    after: CooperativeRunSnapshot;
  }> = [];

  constructor(
    private readonly current: CooperativeRunSnapshot | null,
    private readonly result: "updated" | "duplicate" | "conflict" = "updated",
  ) {}

  async findRun(runId: string): Promise<CooperativeRunSnapshot | null> {
    return this.current?.id === runId ? this.current : null;
  }

  async apply(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunEvent,
  ): Promise<"updated" | "duplicate" | "conflict"> {
    this.transitions.push({ before, after });
    this.events.push(event);
    return this.result;
  }
}

describe("CooperativeRunTransitionService", () => {
  it("applies the canonical transition and builds an immutable event", async () => {
    const repository = new RecordingRepository(running);
    const service = new CooperativeRunTransitionService(repository);

    const result = await service.transition(
      {
        runId: " run-1 ",
        command: {
          kind: "checkpoint",
          progress: 55,
          summary: "Static verification completed.",
          nextAction: "Install and run SDK-backed tests.",
        },
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      run: {
        id: "run-1",
        status: "running",
        progress: 55,
        updatedAt: context.now,
      },
      event: {
        id: context.eventId,
        runId: "run-1",
        kind: "run.checkpoint",
        actor: context.actorId,
        source: "manual",
        summary: "Static verification completed.",
        before: running,
        after: expect.objectContaining({ progress: 55 }),
        occurredAt: context.now,
        idempotencyKey: context.idempotencyKey,
        correlationId: context.correlationId,
      },
    });
    expect(repository.transitions).toHaveLength(1);
    expect(repository.events).toHaveLength(1);
  });

  it("returns not found and validation errors without applying persistence", async () => {
    const missingRepository = new RecordingRepository(null);
    const missing = new CooperativeRunTransitionService(missingRepository);
    await expect(
      missing.transition(
        {
          runId: "missing",
          command: { kind: "heartbeat", summary: "Still running." },
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "RUN_NOT_FOUND" });
    expect(missingRepository.transitions).toHaveLength(0);

    const invalidRepository = new RecordingRepository(running);
    const invalid = new CooperativeRunTransitionService(invalidRepository);
    await expect(
      invalid.transition(
        {
          runId: " ",
          command: { kind: "heartbeat", summary: "Invalid IDs." },
        },
        {
          ...context,
          actorId: " ",
          eventId: " ",
          idempotencyKey: " ",
          correlationId: " ",
        },
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "RUN_ID_REQUIRED",
        "EVENT_ID_REQUIRED",
        "ACTOR_ID_REQUIRED",
        "IDEMPOTENCY_KEY_REQUIRED",
        "CORRELATION_ID_REQUIRED",
      ],
    });
    expect(invalidRepository.transitions).toHaveLength(0);
  });

  it("propagates canonical stale/terminal results and maps repository conflicts", async () => {
    const staleService = new CooperativeRunTransitionService(
      new RecordingRepository(running),
    );
    await expect(
      staleService.transition(
        {
          runId: running.id,
          command: { kind: "heartbeat", summary: "Stale update." },
        },
        { ...context, expectedUpdatedAt: "2026-08-01T19:59:59.000Z" },
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_STATE" });

    const duplicate = new CooperativeRunTransitionService(
      new RecordingRepository(running, "duplicate"),
    );
    await expect(
      duplicate.transition(
        {
          runId: running.id,
          command: { kind: "heartbeat", summary: "Retry." },
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "DUPLICATE" });

    const conflict = new CooperativeRunTransitionService(
      new RecordingRepository(running, "conflict"),
    );
    await expect(
      conflict.transition(
        {
          runId: running.id,
          command: { kind: "heartbeat", summary: "Concurrent update." },
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
