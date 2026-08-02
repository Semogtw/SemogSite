import { describe, expect, it } from "vitest";
import type { CooperativeRunSnapshot } from "./run-state";
import {
  CooperativeRunCheckpointService,
  type CooperativeRunCheckpoint,
  type CooperativeRunCheckpointEvent,
  type CooperativeRunCheckpointRepository,
} from "./run-checkpoint-service";

const running: CooperativeRunSnapshot = {
  id: "run-1",
  projectId: "project-1",
  title: "Foundation implementation",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "Run ledger",
  progress: 40,
  branch: "develop/foundation-bootstrap",
  summary: "Run state model implemented.",
  blocker: null,
  nextAction: "Persist checkpoints.",
  startedAt: "2026-08-01T20:00:00.000Z",
  lastHeartbeatAt: "2026-08-01T20:30:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 3_600,
  updatedAt: "2026-08-01T20:30:00.000Z",
};

const context = {
  actorId: "semogtw-owner",
  eventId: "event-2",
  checkpointId: "checkpoint-1",
  idempotencyKey: "run-1-checkpoint-1",
  correlationId: "correlation-checkpoint-1",
  sourceHash: "checkpoint-source-hash-1",
  source: "chatgpt" as const,
  now: "2026-08-01T21:00:00.000Z",
  expectedUpdatedAt: running.updatedAt,
};

class RecordingRepository implements CooperativeRunCheckpointRepository {
  calls: Array<{
    before: CooperativeRunSnapshot;
    after: CooperativeRunSnapshot;
    event: CooperativeRunCheckpointEvent;
    checkpoint: CooperativeRunCheckpoint;
  }> = [];

  constructor(
    private readonly current: CooperativeRunSnapshot | null,
    private readonly result: "recorded" | "duplicate" | "conflict" = "recorded",
  ) {}

  async findRun(runId: string): Promise<CooperativeRunSnapshot | null> {
    return this.current?.id === runId ? this.current : null;
  }

  async record(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunCheckpointEvent,
    checkpoint: CooperativeRunCheckpoint,
  ): Promise<"recorded" | "duplicate" | "conflict"> {
    this.calls.push({ before, after, event, checkpoint });
    return this.result;
  }
}

describe("CooperativeRunCheckpointService", () => {
  it("normalizes commits and preserves explicit test status", async () => {
    const repository = new RecordingRepository(running);
    const service = new CooperativeRunCheckpointService(repository);

    const result = await service.record(
      {
        runId: " run-1 ",
        progress: 55,
        phase: " SQLite ledger ",
        branch: " develop/foundation-bootstrap ",
        summary: " Registration and transition repositories implemented. ",
        commits: [" ABCDEF123 ", "abcdef123", "1234567"],
        testsStatus: "not_run",
        testsSummary: " Dependencies are unavailable. ",
        blockers: " registry DNS unavailable ",
        nextStep: " Run focused database tests. ",
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      run: expect.objectContaining({
        progress: 55,
        phase: "SQLite ledger",
        branch: "develop/foundation-bootstrap",
        summary: "Registration and transition repositories implemented.",
        nextAction: "Run focused database tests.",
        updatedAt: context.now,
      }),
      event: expect.objectContaining({
        id: context.eventId,
        runId: running.id,
        kind: "run.checkpoint",
        actor: context.actorId,
        source: "chatgpt",
        idempotencyKey: context.idempotencyKey,
        correlationId: context.correlationId,
      }),
      checkpoint: {
        id: context.checkpointId,
        runId: running.id,
        eventId: context.eventId,
        phase: "SQLite ledger",
        progress: 55,
        branch: "develop/foundation-bootstrap",
        summary: "Registration and transition repositories implemented.",
        commits: ["abcdef123", "1234567"],
        testsStatus: "not_run",
        testsSummary: "Dependencies are unavailable.",
        blockers: "registry DNS unavailable",
        nextStep: "Run focused database tests.",
        capturedAt: context.now,
        sourceHash: context.sourceHash,
      },
    });
    expect(repository.calls).toHaveLength(1);
  });

  it("rejects malformed identifiers, commits and checkpoint metadata", async () => {
    const repository = new RecordingRepository(running);
    const service = new CooperativeRunCheckpointService(repository);

    await expect(
      service.record(
        {
          runId: " ",
          progress: 101,
          phase: "x".repeat(201),
          branch: "bad branch",
          summary: " ",
          commits: ["not-a-sha"],
          testsStatus: "passed",
          testsSummary: " ",
          blockers: "x".repeat(2_001),
          nextStep: " ",
        },
        {
          ...context,
          actorId: " ",
          eventId: " ",
          checkpointId: " ",
          idempotencyKey: " ",
          correlationId: " ",
          sourceHash: " ",
        },
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "RUN_ID_REQUIRED",
        "EVENT_ID_REQUIRED",
        "CHECKPOINT_ID_REQUIRED",
        "ACTOR_ID_REQUIRED",
        "IDEMPOTENCY_KEY_REQUIRED",
        "CORRELATION_ID_REQUIRED",
        "SOURCE_HASH_REQUIRED",
        "PHASE_TOO_LONG",
        "BRANCH_INVALID",
        "SUMMARY_REQUIRED",
        "COMMIT_INVALID",
        "TESTS_SUMMARY_REQUIRED",
        "BLOCKERS_TOO_LONG",
        "NEXT_STEP_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("maps not-found, stale, duplicate and conflict without claiming success", async () => {
    const input = {
      runId: running.id,
      progress: 50,
      phase: running.phase,
      branch: running.branch,
      summary: "Checkpoint.",
      commits: [],
      testsStatus: "not_run" as const,
      testsSummary: "Not run.",
      blockers: "",
      nextStep: "Continue.",
    };

    await expect(
      new CooperativeRunCheckpointService(
        new RecordingRepository(null),
      ).record(input, context),
    ).resolves.toEqual({ ok: false, code: "RUN_NOT_FOUND" });

    await expect(
      new CooperativeRunCheckpointService(
        new RecordingRepository(running),
      ).record(input, {
        ...context,
        expectedUpdatedAt: "2026-08-01T20:29:00.000Z",
      }),
    ).resolves.toEqual({ ok: false, code: "STALE_STATE" });

    await expect(
      new CooperativeRunCheckpointService(
        new RecordingRepository(running, "duplicate"),
      ).record(input, context),
    ).resolves.toEqual({ ok: false, code: "DUPLICATE" });

    await expect(
      new CooperativeRunCheckpointService(
        new RecordingRepository(running, "conflict"),
      ).record(input, context),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
