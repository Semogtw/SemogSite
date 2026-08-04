import { describe, expect, it } from "vitest";
import { LearningCheckpointService } from "./checkpoint-service";
import type {
  LearningCheckpointRecord,
  LearningGoalAggregate,
} from "./model";
import type {
  LearningCheckpointRepository,
  LearningGoalRepository,
} from "./ports";

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
} as const;

function baseGoal(
  checkpoints: readonly LearningCheckpointRecord[] = [],
): LearningGoalAggregate {
  return {
    id: "goal-1",
    ownerId: "owner-1",
    slug: "aprender-python",
    title: "Aprender Python",
    description: "",
    motivation: null,
    status: "active",
    priority: "medium",
    targetDate: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    version: 3,
    checkpoints,
    skills: [],
  };
}

function checkpoint(
  overrides: Partial<LearningCheckpointRecord> = {},
): LearningCheckpointRecord {
  return {
    id: "checkpoint-1",
    goalId: "goal-1",
    title: "Prática",
    description: "",
    status: "pending",
    required: true,
    sequence: 1,
    weight: 100,
    weightMode: "custom",
    completionMode: { kind: "binary" },
    acceptedValue: null,
    dueDate: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function createHarness(initial: LearningGoalAggregate) {
  let goal = initial;
  let nextId = 0;
  let conflict = false;
  let replay = false;

  const goalRepository: LearningGoalRepository = {
    async create() {
      throw new Error("NOT_USED");
    },
    async getById(ownerId, id) {
      return goal.ownerId === ownerId && goal.id === id ? goal : null;
    },
    async update() {
      throw new Error("NOT_USED");
    },
  };

  const checkpointRepository: LearningCheckpointRepository = {
    async add(input) {
      if (conflict) return { kind: "conflict" };
      goal = {
        ...goal,
        checkpoints: [...goal.checkpoints, input.checkpoint],
      };
      return replay
        ? { kind: "idempotent", value: input.checkpoint }
        : { kind: "applied", value: input.checkpoint };
    },
    async update(input) {
      if (conflict) return { kind: "conflict" };
      goal = {
        ...goal,
        checkpoints: goal.checkpoints.map((current) =>
          current.id === input.after.id ? input.after : current,
        ),
      };
      return replay
        ? { kind: "idempotent", value: input.after }
        : { kind: "applied", value: input.after };
    },
    async reorder(input) {
      if (conflict) return { kind: "conflict" };
      goal = { ...goal, checkpoints: input.after };
      return replay
        ? { kind: "idempotent", value: input.after }
        : { kind: "applied", value: input.after };
    },
  };

  const service = new LearningCheckpointService(
    goalRepository,
    checkpointRepository,
    { now: () => "2026-08-04T01:00:00.000Z" },
    { next: (prefix) => `${prefix}-${++nextId}` },
  );

  return {
    service,
    get goal() {
      return goal;
    },
    setConflict(value: boolean) {
      conflict = value;
    },
    setReplay(value: boolean) {
      replay = value;
    },
  };
}

describe("LearningCheckpointService", () => {
  it("adds a normalized ordered checkpoint with a custom owner weight", async () => {
    const harness = createHarness(baseGoal([checkpoint()]));
    const result = await harness.service.add(
      {
        goalId: "goal-1",
        expectedGoalVersion: 3,
        title: "  Projeto aplicado  ",
        description: " Criar automação ",
        required: true,
        weight: 40,
        completionMode: { kind: "numeric", unit: " projetos ", target: 2 },
        dueDate: "2026-12-31",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      checkpoint: {
        title: "Projeto aplicado",
        description: "Criar automação",
        sequence: 2,
        weight: 40,
        weightMode: "custom",
        completionMode: { kind: "numeric", unit: "projetos", target: 2 },
        status: "pending",
      },
    });
  });

  it("records a numeric value and completes at the target", async () => {
    const numeric = checkpoint({
      status: "in_progress",
      completionMode: { kind: "numeric", unit: "horas", target: 10 },
      acceptedValue: 4,
    });
    const harness = createHarness(baseGoal([numeric]));

    const partial = await harness.service.recordAcceptedValue(
      {
        goalId: "goal-1",
        checkpointId: "checkpoint-1",
        expectedCheckpointVersion: 1,
        acceptedValue: 7,
        reason: "Sessões concluídas",
      },
      context,
    );
    expect(partial).toMatchObject({
      ok: true,
      checkpoint: {
        acceptedValue: 7,
        status: "in_progress",
        version: 2,
        weightMode: "custom",
      },
    });

    const completed = await harness.service.recordAcceptedValue(
      {
        goalId: "goal-1",
        checkpointId: "checkpoint-1",
        expectedCheckpointVersion: 2,
        acceptedValue: 10,
        reason: "Meta alcançada",
      },
      { ...context, idempotencyKey: "idempotency-2" },
    );
    expect(completed).toMatchObject({
      ok: true,
      checkpoint: {
        acceptedValue: 10,
        status: "completed",
        version: 3,
        weightMode: "custom",
      },
    });
  });

  it("does not complete a numeric checkpoint before its target", async () => {
    const harness = createHarness(
      baseGoal([
        checkpoint({
          status: "in_progress",
          completionMode: { kind: "numeric", unit: "horas", target: 10 },
          acceptedValue: 5,
        }),
      ]),
    );

    await expect(
      harness.service.transition(
        {
          goalId: "goal-1",
          checkpointId: "checkpoint-1",
          expectedCheckpointVersion: 1,
          action: "complete",
          reason: "Tentar concluir",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CHECKPOINT_TARGET_NOT_REACHED" });
  });

  it("requires explicit confirmation for waiver and cancellation", async () => {
    const harness = createHarness(baseGoal([checkpoint()]));
    await expect(
      harness.service.transition(
        {
          goalId: "goal-1",
          checkpointId: "checkpoint-1",
          expectedCheckpointVersion: 1,
          action: "waive",
          reason: "Conteúdo equivalente comprovado",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED"],
    });

    const waived = await harness.service.transition(
      {
        goalId: "goal-1",
        checkpointId: "checkpoint-1",
        expectedCheckpointVersion: 1,
        action: "waive",
        reason: "Conteúdo equivalente comprovado",
        confirmed: true,
      },
      context,
    );
    expect(waived).toMatchObject({
      ok: true,
      checkpoint: { status: "waived", version: 2, weightMode: "custom" },
    });
  });

  it("reorders only with a complete unique ID list", async () => {
    const first = checkpoint({ id: "checkpoint-1", sequence: 1 });
    const second = checkpoint({ id: "checkpoint-2", sequence: 2 });
    const harness = createHarness(baseGoal([first, second]));

    await expect(
      harness.service.reorder(
        {
          goalId: "goal-1",
          expectedGoalVersion: 3,
          orderedCheckpointIds: ["checkpoint-2"],
          reason: "Reorganizar",
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CHECKPOINT_ORDER_MISMATCH" });

    const result = await harness.service.reorder(
      {
        goalId: "goal-1",
        expectedGoalVersion: 3,
        orderedCheckpointIds: ["checkpoint-2", "checkpoint-1"],
        reason: "Reorganizar",
      },
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      checkpoints: [
        {
          id: "checkpoint-2",
          sequence: 1,
          version: 2,
          weightMode: "custom",
        },
        {
          id: "checkpoint-1",
          sequence: 2,
          version: 2,
          weightMode: "custom",
        },
      ],
    });
  });

  it("reports repository conflicts and idempotent replays", async () => {
    const harness = createHarness(baseGoal([checkpoint()]));
    harness.setConflict(true);
    await expect(
      harness.service.transition(
        {
          goalId: "goal-1",
          checkpointId: "checkpoint-1",
          expectedCheckpointVersion: 1,
          action: "start",
          reason: "Começar",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });

    harness.setConflict(false);
    harness.setReplay(true);
    const replay = await harness.service.transition(
      {
        goalId: "goal-1",
        checkpointId: "checkpoint-1",
        expectedCheckpointVersion: 1,
        action: "start",
        reason: "Começar",
        confirmed: false,
      },
      context,
    );
    expect(replay).toMatchObject({ ok: true, replayed: true });
  });
});
