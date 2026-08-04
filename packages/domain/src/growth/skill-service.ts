import type {
  LearningCheckpointSkillLink,
  LearningGoalSkillLink,
  SkillRecord,
  SkillStage,
} from "./model";
import type {
  GrowthClock,
  GrowthIdGenerator,
  GrowthMutationContext,
  SkillRepository,
} from "./ports";
import {
  normalizeSkillSlug,
  validateIsoTimestamp,
  validateSkillStage,
} from "./validation";

export type CreateSkillInput = {
  name: string;
  slug: string | null;
  description: string;
};

export type MergeSkillInput = {
  sourceSkillId: string;
  targetSkillId: string;
  expectedSourceVersion: number;
  reason: string;
  confirmed: boolean;
};

export type ArchiveSkillInput = {
  skillId: string;
  expectedVersion: number;
  reason: string;
  confirmed: boolean;
};

export type LinkGoalSkillInput = {
  goalId: string;
  expectedGoalVersion: number;
  skillId: string;
  desiredStage: SkillStage;
};

export type LinkCheckpointSkillInput = {
  checkpointId: string;
  expectedCheckpointVersion: number;
  skillId: string;
  desiredStage: SkillStage;
};

export type SkillValidationError =
  | "SKILL_NAME_REQUIRED"
  | "SKILL_NAME_TOO_LONG"
  | "SKILL_DESCRIPTION_TOO_LONG"
  | "SKILL_SLUG_REQUIRED"
  | "SKILL_SLUG_TOO_LONG"
  | "SKILL_ID_REQUIRED"
  | "TARGET_SKILL_ID_REQUIRED"
  | "EXPECTED_VERSION_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED"
  | "SKILL_STAGE_INVALID";

export type SkillMutationResult =
  | { ok: true; skill: SkillRecord; replayed: boolean }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly SkillValidationError[];
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "TARGET_NOT_FOUND"
        | "CONFLICT"
        | "INVALID_TRANSITION"
        | "SELF_MERGE"
        | "MERGE_CYCLE";
    };

export type SkillLinkResult<Link> =
  | { ok: true; link: Link; replayed: boolean }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly SkillValidationError[];
    }
  | { ok: false; code: "CONFLICT" };

function normalizeName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error("SKILL_NAME_REQUIRED");
  if (normalized.length > 120) throw new Error("SKILL_NAME_TOO_LONG");
  return normalized;
}

function normalizeDescription(value: string): string {
  const normalized = value.trim();
  if (normalized.length > 2_000) {
    throw new Error("SKILL_DESCRIPTION_TOO_LONG");
  }
  return normalized;
}

function normalizeReason(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 500) throw new Error("REASON_TOO_LONG");
  return normalized;
}

function exceptionValidationError(error: unknown): SkillValidationError | null {
  if (!(error instanceof Error)) return null;
  const supported = new Set<SkillValidationError>([
    "SKILL_NAME_REQUIRED",
    "SKILL_NAME_TOO_LONG",
    "SKILL_DESCRIPTION_TOO_LONG",
    "SKILL_SLUG_REQUIRED",
    "SKILL_SLUG_TOO_LONG",
    "REASON_TOO_LONG",
    "SKILL_STAGE_INVALID",
  ]);
  const code = error.message as SkillValidationError;
  return supported.has(code) ? code : null;
}

export class SkillService {
  constructor(
    private readonly repository: SkillRepository,
    private readonly clock: GrowthClock,
    private readonly ids: GrowthIdGenerator,
  ) {}

  async create(
    input: CreateSkillInput,
    context: GrowthMutationContext,
  ): Promise<SkillMutationResult> {
    try {
      const now = validateIsoTimestamp(this.clock.now());
      const name = normalizeName(input.name);
      const slug = normalizeSkillSlug(input.slug ?? name);
      const description = normalizeDescription(input.description);
      const skill: SkillRecord = {
        id: this.ids.next("skill"),
        ownerId: context.ownerId,
        slug,
        name,
        description,
        status: "active",
        mergedIntoSkillId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      const result = await this.repository.create({
        skill,
        event: {
          id: this.ids.next("skill_event"),
          aggregateType: "skill",
          aggregateId: skill.id,
          sequence: 1,
          action: "skill.create",
          before: null,
          after: skill,
          reason: "Create skill",
          actorId: context.actorId,
          occurredAt: now,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
        },
        context,
      });
      if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
      return {
        ok: true,
        skill: result.value,
        replayed: result.kind === "idempotent",
      };
    } catch (error) {
      const validationError = exceptionValidationError(error);
      if (validationError !== null) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: [validationError],
        };
      }
      throw error;
    }
  }

  async merge(
    input: MergeSkillInput,
    context: GrowthMutationContext,
  ): Promise<SkillMutationResult> {
    const sourceSkillId = input.sourceSkillId.trim();
    const targetSkillId = input.targetSkillId.trim();
    const errors: SkillValidationError[] = [];
    if (sourceSkillId.length === 0) errors.push("SKILL_ID_REQUIRED");
    if (targetSkillId.length === 0) errors.push("TARGET_SKILL_ID_REQUIRED");
    if (
      !Number.isInteger(input.expectedSourceVersion) ||
      input.expectedSourceVersion < 1
    ) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    let reason: string | null = null;
    try {
      reason = normalizeReason(input.reason);
    } catch (error) {
      const validationError = exceptionValidationError(error);
      if (validationError !== null) errors.push(validationError);
      else throw error;
    }
    if (reason === null) errors.push("REASON_REQUIRED");
    if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }
    if (sourceSkillId === targetSkillId) {
      return { ok: false, code: "SELF_MERGE" };
    }

    const source = await this.repository.getById(context.ownerId, sourceSkillId);
    if (source === null) return { ok: false, code: "NOT_FOUND" };
    const target = await this.repository.getById(context.ownerId, targetSkillId);
    if (target === null) return { ok: false, code: "TARGET_NOT_FOUND" };
    if (source.version !== input.expectedSourceVersion) {
      return { ok: false, code: "CONFLICT" };
    }
    if (source.status !== "active" || target.status !== "active") {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    if (
      await this.repository.isMergeTargetInChain({
        ownerId: context.ownerId,
        sourceSkillId,
        targetSkillId,
      })
    ) {
      return { ok: false, code: "MERGE_CYCLE" };
    }

    const now = validateIsoTimestamp(this.clock.now());
    const after: SkillRecord = {
      ...source,
      status: "merged",
      mergedIntoSkillId: target.id,
      updatedAt: now,
      version: source.version + 1,
    };
    const result = await this.repository.update({
      before: source,
      after,
      event: {
        id: this.ids.next("skill_event"),
        aggregateType: "skill",
        aggregateId: source.id,
        sequence: source.version + 1,
        action: "skill.merge",
        before: source,
        after,
        reason: reason ?? "Merge skill",
        actorId: context.actorId,
        occurredAt: now,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      },
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      skill: result.value,
      replayed: result.kind === "idempotent",
    };
  }

  async archive(
    input: ArchiveSkillInput,
    context: GrowthMutationContext,
  ): Promise<SkillMutationResult> {
    const skillId = input.skillId.trim();
    const errors: SkillValidationError[] = [];
    if (skillId.length === 0) errors.push("SKILL_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    let reason: string | null = null;
    try {
      reason = normalizeReason(input.reason);
    } catch (error) {
      const validationError = exceptionValidationError(error);
      if (validationError !== null) errors.push(validationError);
      else throw error;
    }
    if (reason === null) errors.push("REASON_REQUIRED");
    if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.getById(context.ownerId, skillId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "CONFLICT" };
    }
    if (before.status !== "active") {
      return { ok: false, code: "INVALID_TRANSITION" };
    }
    const now = validateIsoTimestamp(this.clock.now());
    const after: SkillRecord = {
      ...before,
      status: "archived",
      updatedAt: now,
      version: before.version + 1,
    };
    const result = await this.repository.update({
      before,
      after,
      event: {
        id: this.ids.next("skill_event"),
        aggregateType: "skill",
        aggregateId: before.id,
        sequence: before.version + 1,
        action: "skill.archive",
        before,
        after,
        reason: reason ?? "Archive skill",
        actorId: context.actorId,
        occurredAt: now,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      },
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      skill: result.value,
      replayed: result.kind === "idempotent",
    };
  }

  async linkGoal(
    input: LinkGoalSkillInput,
    context: GrowthMutationContext,
  ): Promise<SkillLinkResult<LearningGoalSkillLink>> {
    const validation = this.validateLink({
      entityId: input.goalId,
      expectedVersion: input.expectedGoalVersion,
      skillId: input.skillId,
      desiredStage: input.desiredStage,
    });
    if (!validation.ok) return validation.result;
    const link: LearningGoalSkillLink = {
      goalId: validation.entityId,
      skillId: validation.skillId,
      desiredStage: validation.desiredStage,
      createdAt: validateIsoTimestamp(this.clock.now()),
    };
    const result = await this.repository.linkGoal({
      link,
      expectedGoalVersion: input.expectedGoalVersion,
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      link: result.value,
      replayed: result.kind === "idempotent",
    };
  }

  async linkCheckpoint(
    input: LinkCheckpointSkillInput,
    context: GrowthMutationContext,
  ): Promise<SkillLinkResult<LearningCheckpointSkillLink>> {
    const validation = this.validateLink({
      entityId: input.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
      skillId: input.skillId,
      desiredStage: input.desiredStage,
    });
    if (!validation.ok) return validation.result;
    const link: LearningCheckpointSkillLink = {
      checkpointId: validation.entityId,
      skillId: validation.skillId,
      desiredStage: validation.desiredStage,
      createdAt: validateIsoTimestamp(this.clock.now()),
    };
    const result = await this.repository.linkCheckpoint({
      link,
      expectedCheckpointVersion: input.expectedCheckpointVersion,
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      link: result.value,
      replayed: result.kind === "idempotent",
    };
  }

  private validateLink(input: {
    entityId: string;
    expectedVersion: number;
    skillId: string;
    desiredStage: SkillStage;
  }):
    | {
        ok: true;
        entityId: string;
        skillId: string;
        desiredStage: SkillStage;
      }
    | {
        ok: false;
        result: SkillLinkResult<never>;
      } {
    const entityId = input.entityId.trim();
    const skillId = input.skillId.trim();
    const errors: SkillValidationError[] = [];
    if (entityId.length === 0) errors.push("SKILL_ID_REQUIRED");
    if (skillId.length === 0) errors.push("SKILL_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    let desiredStage: SkillStage | null = null;
    try {
      desiredStage = validateSkillStage(input.desiredStage);
    } catch {
      errors.push("SKILL_STAGE_INVALID");
    }
    if (errors.length > 0 || desiredStage === null) {
      return {
        ok: false,
        result: { ok: false, code: "VALIDATION_FAILED", errors },
      };
    }
    return { ok: true, entityId, skillId, desiredStage };
  }
}
