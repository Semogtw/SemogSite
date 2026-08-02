import { describe, expect, it } from "vitest";
import {
  CooperativeRunRegistrationService,
  type CooperativeRunRegistrationEvent,
  type CooperativeRunRegistrationRepository,
  type CooperativeRunSnapshot,
} from "./run-registration-service";

const context = {
  actorId: "semogtw-owner",
  runId: "run-1",
  eventId: "run-event-1",
  idempotencyKey: "chatgpt-run-2026-08-01-1",
  correlationId: "correlation-run-1",
  now: "2026-08-01T20:00:00.000Z",
};

class RecordingRepository implements CooperativeRunRegistrationRepository {
  calls: Array<{
    run: CooperativeRunSnapshot;
    event: CooperativeRunRegistrationEvent;
  }> = [];

  constructor(
    private readonly result:
      | "created"
      | "duplicate"
      | "project_not_found"
      | "conflict" = "created",
  ) {}

  async register(
    run: CooperativeRunSnapshot,
    event: CooperativeRunRegistrationEvent,
  ): Promise<"created" | "duplicate" | "project_not_found" | "conflict"> {
    this.calls.push({ run, event });
    return this.result;
  }
}

describe("CooperativeRunRegistrationService", () => {
  it("creates a running snapshot and immutable registration event", async () => {
    const repository = new RecordingRepository();
    const service = new CooperativeRunRegistrationService(repository);

    const result = await service.register(
      {
        projectId: " project-1 ",
        title: " Foundation implementation ",
        actorLabel: " ChatGPT ",
        origin: "chatgpt",
        phase: " MCP hardening ",
        branch: " develop/foundation-bootstrap ",
        initialSummary: " Read-only MCP adapter implemented. ",
        nextAction: " Run dependency-complete tests. ",
        staleAfterSeconds: 3_600,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      run: {
        id: "run-1",
        projectId: "project-1",
        title: "Foundation implementation",
        actorLabel: "ChatGPT",
        origin: "chatgpt",
        status: "running",
        phase: "MCP hardening",
        progress: 0,
        branch: "develop/foundation-bootstrap",
        summary: "Read-only MCP adapter implemented.",
        blocker: null,
        nextAction: "Run dependency-complete tests.",
        startedAt: context.now,
        lastHeartbeatAt: context.now,
        finishedAt: null,
        staleAfterSeconds: 3_600,
        updatedAt: context.now,
      },
      event: {
        id: "run-event-1",
        runId: "run-1",
        kind: "run.registered",
        actor: "semogtw-owner",
        summary: "Read-only MCP adapter implemented.",
        occurredAt: context.now,
        source: "chatgpt",
        idempotencyKey: "chatgpt-run-2026-08-01-1",
        correlationId: "correlation-run-1",
      },
    });
    expect(repository.calls).toEqual(
      result.ok ? [{ run: result.run, event: result.event }] : [],
    );
  });

  it("rejects invalid identifiers, text, origin, branch, threshold and clock", async () => {
    const repository = new RecordingRepository();
    const service = new CooperativeRunRegistrationService(repository);

    await expect(
      service.register(
        {
          projectId: "Project With Spaces",
          title: " ",
          actorLabel: " ",
          origin: "hidden_model" as "chatgpt",
          phase: "x".repeat(201),
          branch: "bad branch",
          initialSummary: " ",
          nextAction: " ",
          staleAfterSeconds: 60,
        },
        { ...context, runId: " ", eventId: " ", now: "invalid" },
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "RUN_ID_REQUIRED",
        "EVENT_ID_REQUIRED",
        "PROJECT_ID_INVALID",
        "TITLE_REQUIRED",
        "ACTOR_LABEL_REQUIRED",
        "ORIGIN_INVALID",
        "PHASE_TOO_LONG",
        "BRANCH_INVALID",
        "SUMMARY_REQUIRED",
        "NEXT_ACTION_REQUIRED",
        "STALE_THRESHOLD_INVALID",
        "NOW_INVALID",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it.each([
    ["duplicate", "DUPLICATE"],
    ["project_not_found", "PROJECT_NOT_FOUND"],
    ["conflict", "CONFLICT"],
  ] as const)("maps repository result %s without claiming creation", async (stored, code) => {
    const service = new CooperativeRunRegistrationService(
      new RecordingRepository(stored),
    );

    await expect(
      service.register(
        {
          projectId: null,
          title: "Independent verification",
          actorLabel: "Codex",
          origin: "codex",
          phase: null,
          branch: null,
          initialSummary: "Verification started.",
          nextAction: "Inspect the latest branch.",
          staleAfterSeconds: 1_800,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code });
  });
});
