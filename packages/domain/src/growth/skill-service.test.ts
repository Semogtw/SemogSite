import { describe, expect, it } from "vitest";
import type {
  LearningCheckpointSkillLink,
  LearningGoalSkillLink,
  SkillRecord,
} from "./model";
import type { SkillRepository } from "./ports";
import { SkillService } from "./skill-service";

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
} as const;

function skill(
  id: string,
  overrides: Partial<SkillRecord> = {},
): SkillRecord {
  return {
    id,
    ownerId: "owner-1",
    slug: id,
    name: id,
    description: "",
    status: "active",
    mergedIntoSkillId: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function createHarness(initial: readonly SkillRecord[] = []) {
  const skills = new Map(initial.map((value) => [value.id, value]));
  let nextId = 0;
  let conflict = false;
  let replay = false;
  let mergeCycle = false;
  const goalLinks: LearningGoalSkillLink[] = [];
  const checkpointLinks: LearningCheckpointSkillLink[] = [];

  const repository: SkillRepository = {
    async create(input) {
      if (conflict) return { kind: "conflict" };
      skills.set(input.skill.id, input.skill);
      return replay
        ? { kind: "idempotent", value: input.skill }
        : { kind: "applied", value: input.skill };
    },
    async getById(ownerId, skillId) {
      const value = skills.get(skillId) ?? null;
      return value?.ownerId === ownerId ? value : null;
    },
    async update(input) {
      if (conflict) return { kind: "conflict" };
      skills.set(input.after.id, input.after);
      return replay
        ? { kind: "idempotent", value: input.after }
        : { kind: "applied", value: input.after };
    },
    async isMergeTargetInChain() {
      return mergeCycle;
    },
    async linkGoal(input) {
      if (conflict) return { kind: "conflict" };
      goalLinks.push(input.link);
      return replay
        ? { kind: "idempotent", value: input.link }
        : { kind: "applied", value: input.link };
    },
    async linkCheckpoint(input) {
      if (conflict) return { kind: "conflict" };
      checkpointLinks.push(input.link);
      return replay
        ? { kind: "idempotent", value: input.link }
        : { kind: "applied", value: input.link };
    },
  };

  const service = new SkillService(
    repository,
    { now: () => "2026-08-04T01:30:00.000Z" },
    { next: (prefix) => `${prefix}-${++nextId}` },
  );

  return {
    service,
    skills,
    goalLinks,
    checkpointLinks,
    setConflict(value: boolean) {
      conflict = value;
    },
    setReplay(value: boolean) {
      replay = value;
    },
    setMergeCycle(value: boolean) {
      mergeCycle = value;
    },
  };
}

describe("SkillService", () => {
  it("creates a normalized active skill", async () => {
    const harness = createHarness();
    const result = await harness.service.create(
      {
        name: "  Node.JS  ",
        slug: null,
        description: " Runtime JavaScript ",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      skill: {
        slug: "node-js",
        name: "Node.JS",
        description: "Runtime JavaScript",
        status: "active",
        version: 1,
      },
    });
  });

  it("rejects self merges and merge cycles", async () => {
    const harness = createHarness([skill("skill-a"), skill("skill-b")]);
    await expect(
      harness.service.merge(
        {
          sourceSkillId: "skill-a",
          targetSkillId: "skill-a",
          expectedSourceVersion: 1,
          reason: "Duplicada",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "SELF_MERGE" });

    harness.setMergeCycle(true);
    await expect(
      harness.service.merge(
        {
          sourceSkillId: "skill-a",
          targetSkillId: "skill-b",
          expectedSourceVersion: 1,
          reason: "Duplicada",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "MERGE_CYCLE" });
  });

  it("merges one active skill into another while preserving identity", async () => {
    const harness = createHarness([skill("skill-a"), skill("skill-b")]);
    const result = await harness.service.merge(
      {
        sourceSkillId: "skill-a",
        targetSkillId: "skill-b",
        expectedSourceVersion: 1,
        reason: "Consolidar aliases",
        confirmed: true,
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      skill: {
        id: "skill-a",
        status: "merged",
        mergedIntoSkillId: "skill-b",
        version: 2,
      },
    });
  });

  it("requires confirmation before archival", async () => {
    const harness = createHarness([skill("skill-a")]);
    await expect(
      harness.service.archive(
        {
          skillId: "skill-a",
          expectedVersion: 1,
          reason: "Não utilizada",
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

  it("links desired stages without accepting achieved proficiency", async () => {
    const harness = createHarness([skill("skill-a")]);
    const goalResult = await harness.service.linkGoal(
      {
        goalId: "goal-1",
        expectedGoalVersion: 3,
        skillId: "skill-a",
        desiredStage: "applied",
      },
      context,
    );
    expect(goalResult).toMatchObject({
      ok: true,
      link: {
        goalId: "goal-1",
        skillId: "skill-a",
        desiredStage: "applied",
      },
    });

    const checkpointResult = await harness.service.linkCheckpoint(
      {
        checkpointId: "checkpoint-1",
        expectedCheckpointVersion: 2,
        skillId: "skill-a",
        desiredStage: "demonstrated",
      },
      { ...context, idempotencyKey: "idempotency-2" },
    );
    expect(checkpointResult).toMatchObject({
      ok: true,
      link: {
        checkpointId: "checkpoint-1",
        skillId: "skill-a",
        desiredStage: "demonstrated",
      },
    });
  });

  it("reports conflicts and idempotent replays", async () => {
    const harness = createHarness();
    harness.setConflict(true);
    await expect(
      harness.service.create(
        { name: "TypeScript", slug: null, description: "" },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });

    harness.setConflict(false);
    harness.setReplay(true);
    const replay = await harness.service.create(
      { name: "TypeScript", slug: null, description: "" },
      context,
    );
    expect(replay).toMatchObject({ ok: true, replayed: true });
  });
});
