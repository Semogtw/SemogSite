import type {
  LearningCheckpointRecord,
  LearningGoalAggregate,
  LearningGoalRecord,
  LearningGoalSkillLink,
  LearningCheckpointSkillLink,
  SkillRecord,
} from "./model";

export interface GrowthClock {
  now(): string;
}

export interface GrowthIdGenerator {
  next(prefix: string): string;
}

export type GrowthMutationContext = {
  ownerId: string;
  actorId: string;
  correlationId: string;
  idempotencyKey: string;
};

export type GrowthDomainEvent<Before, After> = {
  id: string;
  aggregateType: "learning_goal" | "learning_checkpoint" | "skill";
  aggregateId: string;
  sequence: number;
  action: string;
  before: Before;
  after: After;
  reason: string;
  actorId: string;
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string;
};

export type GrowthWriteResult<T> =
  | { kind: "applied"; value: T }
  | { kind: "idempotent"; value: T }
  | { kind: "conflict" };

export type CreateLearningGoalRecord = {
  goal: LearningGoalRecord;
  event: GrowthDomainEvent<LearningGoalRecord | null, LearningGoalRecord>;
  context: GrowthMutationContext;
};

export type UpdateLearningGoalRecord = {
  before: LearningGoalAggregate;
  after: LearningGoalAggregate;
  event: GrowthDomainEvent<LearningGoalRecord, LearningGoalRecord>;
  context: GrowthMutationContext;
};

export interface LearningGoalRepository {
  create(
    input: CreateLearningGoalRecord,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>>;
  getById(ownerId: string, id: string): Promise<LearningGoalAggregate | null>;
  update(
    input: UpdateLearningGoalRecord,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>>;
}

export type AddLearningCheckpointRecord = {
  goal: LearningGoalAggregate;
  checkpoint: LearningCheckpointRecord;
  event: GrowthDomainEvent<LearningCheckpointRecord | null, LearningCheckpointRecord>;
  context: GrowthMutationContext;
};

export type UpdateLearningCheckpointRecord = {
  goal: LearningGoalAggregate;
  before: LearningCheckpointRecord;
  after: LearningCheckpointRecord;
  event: GrowthDomainEvent<
    LearningCheckpointRecord,
    LearningCheckpointRecord
  >;
  context: GrowthMutationContext;
};

export type ReorderLearningCheckpointsRecord = {
  goal: LearningGoalAggregate;
  before: readonly LearningCheckpointRecord[];
  after: readonly LearningCheckpointRecord[];
  event: GrowthDomainEvent<
    readonly LearningCheckpointRecord[],
    readonly LearningCheckpointRecord[]
  >;
  context: GrowthMutationContext;
};

export interface LearningCheckpointRepository {
  add(
    input: AddLearningCheckpointRecord,
  ): Promise<GrowthWriteResult<LearningCheckpointRecord>>;
  update(
    input: UpdateLearningCheckpointRecord,
  ): Promise<GrowthWriteResult<LearningCheckpointRecord>>;
  reorder(
    input: ReorderLearningCheckpointsRecord,
  ): Promise<GrowthWriteResult<readonly LearningCheckpointRecord[]>>;
}

export type CreateSkillRecord = {
  skill: SkillRecord;
  event: GrowthDomainEvent<SkillRecord | null, SkillRecord>;
  context: GrowthMutationContext;
};

export type UpdateSkillRecord = {
  before: SkillRecord;
  after: SkillRecord;
  event: GrowthDomainEvent<SkillRecord, SkillRecord>;
  context: GrowthMutationContext;
};

export interface SkillRepository {
  create(input: CreateSkillRecord): Promise<GrowthWriteResult<SkillRecord>>;
  getById(ownerId: string, skillId: string): Promise<SkillRecord | null>;
  update(input: UpdateSkillRecord): Promise<GrowthWriteResult<SkillRecord>>;
  isMergeTargetInChain(input: {
    ownerId: string;
    sourceSkillId: string;
    targetSkillId: string;
  }): Promise<boolean>;
  linkGoal(input: {
    link: LearningGoalSkillLink;
    expectedGoalVersion: number;
    context: GrowthMutationContext;
  }): Promise<GrowthWriteResult<LearningGoalSkillLink>>;
  linkCheckpoint(input: {
    link: LearningCheckpointSkillLink;
    expectedCheckpointVersion: number;
    context: GrowthMutationContext;
  }): Promise<GrowthWriteResult<LearningCheckpointSkillLink>>;
}
