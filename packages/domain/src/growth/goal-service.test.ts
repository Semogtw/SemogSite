import { describe, expect, it } from "vitest";
import type { LearningGoalAggregate } from "./model";
import type {
  CreateLearningGoalRecord,
  LearningGoalRepository,
  UpdateLearningGoalRecord,
} from "./ports";
import { LearningGoalService } from "./goal-service";

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
} as const;

function createHarness(initial: LearningGoalAggregate | null = null) {
  let stored = initial;
  let createInput: CreateLearningGoalRecord | null = null;
  let updateInput: UpdateLearningGoalRecord | null = null;
  let conflict = false;
  let replayCreate = false;
  let replayUpdate = false;
  let nextId = 0;

  const repository: LearningGoalRepository = {
    async create(input) {
      createInput = input;
      if (conflict) return { kind: "conflict" };
      const value: LearningGoalAggregate = {
        ...input.goal,
        checkpoints: [],
        skills: [],
      };
      stored = value;
      return replayCreate
        ? { kind: "idempotent", value }
        : { kind: "applied", value };
    },
    async getById(ownerId, id) {
      if (stored?.ownerId !== ownerId || stored.id !== id) return null;
      return stored;
    },
    async update(input) {
      updateInput = input;
      if (conflict) return { kind: "conflict" };
      stored = input.after;
      return replayUpdate
        ? { kind: "idempotent", value: input.after }
        : { kind: "applied", value: input.after };
    },
  };

  const service = new LearningGoalService(
    repository,
    { now: () => "2026-08-04T00:30:00.000Z" },
    { next: (prefix) => `${prefix}-${++nextId}` },
  );

  return {
    service,
    get stored() {
      return stored;
    },
    get createInput() {
      return createInput;
    },
    get updateInput() {
      return updateInput;
    },
    setConflict(value: boolean) {
      conflict = value;
    },
    setReplayCreate(value: boolean) {
      replayCreate = value;
    },
    setReplayUpdate(value: boolean) {
      replayUpdate = value;
    },
  };
}

function goal(
  status: LearningGoalAggregate["status"] = "draft",
): LearningGoalAggregate {
  return {
    id: "goal-1",
    ownerId: "owner-1",
    slug: "aprender-python",
    title: "Aprender Python",
    description: "",
    motivation: null,
    status,
    priority: "medium",
    targetDate: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    version: 1,
    checkpoints: [],
    skills: [],
  };
}

describe("LearningGoalService", () => {
  it("creates a normalized private draft and domain event", async () => {
    const harness = createHarness();
    const result = await harness.service.createDraft(
      {
        title: "  Aprender Python  ",
        slug: null,
        description: " Automação pessoal ",
        motivation: "  Criar ferramentas  ",
        priority: "high",
        targetDate: "2026-12-31",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      goal: {
        slug: "aprender-python",
        title: "Aprender Python",
        description: "Automação pessoal",
        motivation: "Criar ferramentas",
        status: "draft",
        version: 1,
      },
    });
    expect(harness.createInput?.event).toMatchObject({
      action: "learning_goal.create_draft",
      aggregateType: "learning_goal",
      sequence: 1,
      before: null,
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    });
  });

  it("returns stable validation errors", async () => {
    const harness = createHarness();
    await expect(
      harness.service.createDraft(
        {
          title: " ",
          slug: null,
          description: "",
          motivation: null,
          priority: "medium",
          targetDate: null,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["LEARNING_GOAL_TITLE_REQUIRED"],
    });
  });

  it("activates, pauses and resumes with optimistic versions", async () => {
    const harness = createHarness(goal("draft"));
    const activated = await harness.service.transition(
      {
        goalId: "goal-1",
        expectedVersion: 1,
        action: "activate",
        reason: "Começar estudo",
        confirmed: false,
      },
      context,
    );
    expect(activated).toMatchObject({
      ok: true,
      goal: { status: "active", version: 2 },
    });

    const paused = await harness.service.transition(
      {
        goalId: "goal-1",
        expectedVersion: 2,
        action: "pause",
        reason: "Prioridade temporária",
        confirmed: false,
      },
      { ...context, idempotencyKey: "idempotency-2" },
    );
    expect(paused).toMatchObject({
      ok: true,
      goal: { status: "paused", version: 3 },
    });

    const resumed = await harness.service.transition(
      {
        goalId: "goal-1",
        expectedVersion: 3,
        action: "resume",
        reason: "Retomar",
        confirmed: false,
      },
      { ...context, idempotencyKey: "idempotency-3" },
    );
    expect(resumed).toMatchObject({
      ok: true,
      goal: { status: "active", version: 4 },
    });
  });

  it("requires measurable complete progress before completion", async () => {
    const emptyHarness = createHarness(goal("active"));
    await expect(
      emptyHarness.service.transition(
        {
          goalId: "goal-1",
          expectedVersion: 1,
          action: "complete",
          reason: "Finalizar",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRESS_NOT_MEASURABLE" });

    const incomplete = goal("active");
    incomplete.checkpoints = [
      {
        id: "checkpoint-1",
        goalId: "goal-1",
        title: "Prática",
        description: "",
        status: "in_progress",
        required: true,
        sequence: 1,
        weight: 100,
        completionMode: { kind: "numeric", unit: "horas", target: 10 },
        acceptedValue: 5,
        dueDate: null,
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
        version: 1,
      },
    ];
    const incompleteHarness = createHarness(incomplete);
    await expect(
      incompleteHarness.service.transition(
        {
          goalId: "goal-1",
          expectedVersion: 1,
          action: "complete",
          reason: "Finalizar",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRESS_NOT_COMPLETE" });

    const complete = goal("active");
    complete.checkpoints = [
      {
        ...incomplete.checkpoints[0]!,
        status: "completed",
        acceptedValue: 10,
      },
    ];
    const completeHarness = createHarness(complete);
    const result = await completeHarness.service.transition(
      {
        goalId: "goal-1",
        expectedVersion: 1,
        action: "complete",
        reason: "Todos os checkpoints concluídos",
        confirmed: false,
      },
      context,
    );
    expect(result).toMatchObject({ ok: true, goal: { status: "completed" } });
  });

  it("requires confirmation for cancellation and archival", async () => {
    const harness = createHarness(goal("active"));
    await expect(
      harness.service.transition(
        {
          goalId: "goal-1",
          expectedVersion: 1,
          action: "cancel",
          reason: "Mudança de plano",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED"],
    });
  });

  it("returns conflicts and exposes repository idempotent replays", async () => {
    const harness = createHarness(goal("draft"));
    harness.setConflict(true);
    await expect(
      harness.service.transition(
        {
          goalId: "goal-1",
          expectedVersion: 1,
          action: "activate",
          reason: "Começar",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });

    harness.setConflict(false);
    harness.setReplayUpdate(true);
    const replay = await harness.service.transition(
      {
        goalId: "goal-1",
        expectedVersion: 1,
        action: "activate",
        reason: "Começar",
        confirmed: false,
      },
      context,
    );
    expect(replay).toMatchObject({ ok: true, replayed: true });
  });
});
