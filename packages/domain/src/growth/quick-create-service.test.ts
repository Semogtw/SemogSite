import { describe, expect, it } from "vitest";
import type { GrowthWriteResult, LearningGoalAggregate } from "./index";
import {
  QuickLearningGoalService,
  type QuickCreateLearningGoalPersistence,
  type QuickLearningGoalRepository,
} from "./quick-create-service";

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
} as const;

function createHarness() {
  let captured: QuickCreateLearningGoalPersistence | null = null;
  let resultKind: GrowthWriteResult<LearningGoalAggregate>["kind"] = "applied";
  let nextId = 0;

  const repository: QuickLearningGoalRepository = {
    async create(input) {
      captured = input;
      const value: LearningGoalAggregate = {
        ...input.goal,
        checkpoints: input.checkpoints,
        skills: [],
      };
      return resultKind === "conflict"
        ? { kind: "conflict" }
        : { kind: resultKind, value };
    },
  };

  return {
    service: new QuickLearningGoalService(
      repository,
      { now: () => "2026-08-04T03:00:00.000Z" },
      { next: (prefix) => `${prefix}-${++nextId}` },
    ),
    get captured() {
      return captured;
    },
    setResultKind(kind: GrowthWriteResult<LearningGoalAggregate>["kind"]) {
      resultKind = kind;
    },
  };
}

describe("QuickLearningGoalService", () => {
  it("creates a manual title-only draft with one goal event", async () => {
    const harness = createHarness();
    const result = await harness.service.create(
      {
        title: "Aprender Python",
        targetDate: null,
        motivation: null,
        templateId: null,
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      goal: {
        title: "Aprender Python",
        status: "draft",
        checkpoints: [],
      },
    });
    expect(harness.captured).toMatchObject({
      origin: { kind: "manual" },
      goalEvent: {
        action: "learning_goal.quick_create",
        sequence: 1,
        before: null,
      },
      checkpointEvents: [],
    });
  });

  it("materializes a template into five ordered checkpoint records and events", async () => {
    const harness = createHarness();
    const result = await harness.service.create(
      {
        title: "Aprender Python para automação",
        targetDate: "2026-12-31",
        motivation: "Criar ferramentas",
        templateId: "learn_programming_language",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      goal: { checkpoints: expect.arrayContaining([expect.any(Object)]) },
    });
    expect(harness.captured?.checkpoints).toHaveLength(5);
    expect(harness.captured?.checkpoints.map((value) => value.sequence)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      harness.captured?.checkpoints.reduce(
        (total, checkpoint) => total + checkpoint.weight,
        0,
      ),
    ).toBe(100);
    expect(harness.captured?.checkpointEvents).toHaveLength(5);
    expect(
      harness.captured?.checkpointEvents.every(
        (event) =>
          event.sequence === 1 &&
          event.action === "learning_checkpoint.template_add",
      ),
    ).toBe(true);
    expect(harness.captured?.origin).toEqual({
      kind: "template",
      templateId: "learn_programming_language",
      templateVersion: 1,
    });
  });

  it("returns stable validation failures before repository access", async () => {
    const harness = createHarness();
    await expect(
      harness.service.create(
        {
          title: "",
          targetDate: null,
          motivation: null,
          templateId: null,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      error: "LEARNING_GOAL_TITLE_REQUIRED",
    });
    expect(harness.captured).toBeNull();
  });

  it("maps conflicts and idempotent replays", async () => {
    const harness = createHarness();
    harness.setResultKind("conflict");
    await expect(
      harness.service.create(
        {
          title: "Meta",
          targetDate: null,
          motivation: null,
          templateId: null,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });

    harness.setResultKind("idempotent");
    const replay = await harness.service.create(
      {
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
      },
      context,
    );
    expect(replay).toMatchObject({ ok: true, replayed: true });
  });
});
