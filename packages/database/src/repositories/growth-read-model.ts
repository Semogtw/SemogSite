import {
  deriveGoalProgress,
  type CheckpointCompletionMode,
  type LearningCheckpointStatus,
  type LearningGoalStatus,
  type Priority,
  type SkillStage,
} from "@semogtw/domain/growth";
import type { SqliteDatabase } from "../adapters/sqlite";

export type GrowthProgressRead = {
  percent: number | null;
  measurable: boolean;
  completedWeight: number;
  effectiveWeight: number;
  requiredCheckpointsComplete: boolean;
};

export type LearningCheckpointRead = {
  id: string;
  goalId: string;
  title: string;
  description: string;
  status: LearningCheckpointStatus;
  required: boolean;
  sequence: number;
  weight: number;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
  dueDate: string | null;
  updatedAt: string;
  version: number;
};

export type LearningCheckpointSummaryRead = {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  status: LearningCheckpointStatus;
  required: boolean;
  sequence: number;
  weight: number;
  dueDate: string;
};

export type LearningGoalSummaryRead = {
  id: string;
  slug: string;
  title: string;
  status: LearningGoalStatus;
  priority: Priority;
  targetDate: string | null;
  progress: GrowthProgressRead;
  checkpointCount: number;
  nextCheckpoint: {
    id: string;
    title: string;
    status: "pending" | "in_progress";
    dueDate: string | null;
  } | null;
  updatedAt: string;
  version: number;
};

export type LearningGoalSkillRead = {
  skillId: string;
  canonicalSkillId: string;
  name: string;
  desiredStage: SkillStage;
};

export type LearningGoalDetailRead = LearningGoalSummaryRead & {
  description: string;
  motivation: string | null;
  checkpoints: readonly LearningCheckpointRead[];
  skills: readonly LearningGoalSkillRead[];
  progressExplanation: readonly {
    checkpointId: string;
    ratio: number;
    weightedContribution: number;
  }[];
};

export type SkillSummaryRead = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "archived" | "merged";
  canonicalSkillId: string;
  aliases: readonly string[];
  updatedAt: string;
  version: number;
};

export type GrowthOverviewRead = {
  activeGoals: readonly LearningGoalSummaryRead[];
  dueCheckpoints: readonly LearningCheckpointSummaryRead[];
  skillSummaries: readonly SkillSummaryRead[];
  generatedAt: string;
};

type GoalRow = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  motivation: string | null;
  status: LearningGoalStatus;
  priority: Priority;
  target_date: string | null;
  updated_at: string;
  version: number;
};

type CheckpointRow = {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  status: LearningCheckpointStatus;
  required: number;
  sequence: number;
  weight: number;
  completion_mode: "binary" | "numeric";
  numeric_unit: string | null;
  numeric_target: number | null;
  accepted_value: number | null;
  due_date: string | null;
  updated_at: string;
  version: number;
};

type DueCheckpointRow = CheckpointRow & {
  goal_title: string;
};

type SkillRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "archived" | "merged";
  merged_into_skill_id: string | null;
  updated_at: string;
  version: number;
};

type GoalSkillRow = {
  skill_id: string;
  desired_stage: SkillStage;
  skill_name: string;
};

const GOAL_STATUSES = new Set<LearningGoalStatus>([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
]);

function validateOwnerId(ownerId: string): string {
  const value = ownerId.trim();
  if (value.length === 0 || value.length > 200) {
    throw new Error("GROWTH_OWNER_ID_INVALID");
  }
  return value;
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("GROWTH_READ_LIMIT_INVALID");
  }
  return limit;
}

function validateStatuses(
  statuses: readonly LearningGoalStatus[],
): readonly LearningGoalStatus[] {
  if (statuses.length === 0) {
    throw new Error("GROWTH_STATUS_FILTER_REQUIRED");
  }
  const normalized = [...new Set(statuses)];
  if (normalized.some((status) => !GOAL_STATUSES.has(status))) {
    throw new Error("GROWTH_STATUS_FILTER_INVALID");
  }
  return normalized.sort();
}

function completionModeFromRow(row: CheckpointRow): CheckpointCompletionMode {
  if (
    row.required !== 0 &&
    row.required !== 1
  ) {
    throw new Error("GROWTH_CHECKPOINT_ROW_INVALID");
  }
  if (row.completion_mode === "binary") {
    if (
      row.numeric_unit !== null ||
      row.numeric_target !== null ||
      row.accepted_value !== null
    ) {
      throw new Error("GROWTH_CHECKPOINT_ROW_INVALID");
    }
    return { kind: "binary" };
  }
  if (
    row.completion_mode !== "numeric" ||
    row.numeric_unit === null ||
    row.numeric_unit.trim().length === 0 ||
    row.numeric_target === null ||
    !Number.isFinite(row.numeric_target) ||
    row.numeric_target <= 0 ||
    (row.accepted_value !== null &&
      (!Number.isFinite(row.accepted_value) || row.accepted_value < 0))
  ) {
    throw new Error("GROWTH_CHECKPOINT_ROW_INVALID");
  }
  return {
    kind: "numeric",
    unit: row.numeric_unit,
    target: row.numeric_target,
  };
}

function checkpointFromRow(row: CheckpointRow): LearningCheckpointRead {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    status: row.status,
    required: row.required === 1,
    sequence: row.sequence,
    weight: row.weight,
    completionMode: completionModeFromRow(row),
    acceptedValue: row.accepted_value,
    dueDate: row.due_date,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function progressFromCheckpoints(
  checkpoints: readonly LearningCheckpointRead[],
): {
  summary: GrowthProgressRead;
  explanation: readonly {
    checkpointId: string;
    ratio: number;
    weightedContribution: number;
  }[];
} {
  const projection = deriveGoalProgress(
    checkpoints.map((checkpoint) => ({
      checkpointId: checkpoint.id,
      required: checkpoint.required,
      status: checkpoint.status,
      weight: checkpoint.weight,
      completionMode: checkpoint.completionMode,
      acceptedValue: checkpoint.acceptedValue,
    })),
  );
  return {
    summary: {
      percent: projection.percent,
      measurable: projection.measurable,
      completedWeight: projection.completedWeight,
      effectiveWeight: projection.effectiveWeight,
      requiredCheckpointsComplete:
        projection.requiredCheckpointsComplete,
    },
    explanation: projection.explanation,
  };
}

export class SqliteGrowthReadModel {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getOverview(input: { ownerId: string }): Promise<GrowthOverviewRead> {
    const ownerId = validateOwnerId(input.ownerId);
    const [activeGoals, dueCheckpoints, skillSummaries] = await Promise.all([
      this.listGoals({ ownerId, statuses: ["active"], limit: 20 }),
      Promise.resolve(this.listDueCheckpoints(ownerId, 20)),
      this.listSkills({ ownerId, includeArchived: false, limit: 20 }),
    ]);
    return {
      activeGoals,
      dueCheckpoints,
      skillSummaries,
      generatedAt: this.now(),
    };
  }

  async listGoals(input: {
    ownerId: string;
    statuses: readonly LearningGoalStatus[];
    limit: number;
  }): Promise<readonly LearningGoalSummaryRead[]> {
    const ownerId = validateOwnerId(input.ownerId);
    const statuses = validateStatuses(input.statuses);
    const limit = validateLimit(input.limit);
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, title, description, motivation, status,
                priority, target_date, updated_at, version
         FROM learning_goals
         WHERE owner_id = ? AND status IN (${placeholders})
         ORDER BY updated_at DESC, id ASC
         LIMIT ?`,
      )
      .all(ownerId, ...statuses, limit) as GoalRow[];

    return rows.map((row) => this.goalSummaryFromRow(row));
  }

  async getGoal(input: {
    ownerId: string;
    goalId: string;
  }): Promise<LearningGoalDetailRead | null> {
    const ownerId = validateOwnerId(input.ownerId);
    const goalId = input.goalId.trim();
    if (goalId.length === 0 || goalId.length > 200) {
      throw new Error("GROWTH_GOAL_ID_INVALID");
    }
    const row = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, title, description, motivation, status,
                priority, target_date, updated_at, version
         FROM learning_goals
         WHERE owner_id = ? AND id = ?`,
      )
      .get(ownerId, goalId) as GoalRow | undefined;
    if (row === undefined) return null;

    const checkpoints = this.listGoalCheckpoints(goalId);
    const progress = progressFromCheckpoints(checkpoints);
    const skills = this.database.$client
      .prepare(
        `SELECT link.skill_id, link.desired_stage, skill.name AS skill_name
         FROM learning_goal_skills AS link
         INNER JOIN skills AS skill ON skill.id = link.skill_id
         WHERE link.goal_id = ? AND skill.owner_id = ?
         ORDER BY skill.name COLLATE NOCASE ASC, skill.id ASC`,
      )
      .all(goalId, ownerId) as GoalSkillRow[];

    return {
      ...this.goalSummaryFromRow(row, checkpoints, progress.summary),
      description: row.description,
      motivation: row.motivation,
      checkpoints,
      skills: skills.map((skill) => ({
        skillId: skill.skill_id,
        canonicalSkillId: this.resolveCanonicalSkillId(
          ownerId,
          skill.skill_id,
        ),
        name: skill.skill_name,
        desiredStage: skill.desired_stage,
      })),
      progressExplanation: progress.explanation,
    };
  }

  async listSkills(input: {
    ownerId: string;
    includeArchived: boolean;
    limit: number;
  }): Promise<readonly SkillSummaryRead[]> {
    const ownerId = validateOwnerId(input.ownerId);
    const limit = validateLimit(input.limit);
    const rows = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, name, description, status,
                merged_into_skill_id, updated_at, version
         FROM skills
         WHERE owner_id = ?
           AND (? = 1 OR status = 'active')
         ORDER BY name COLLATE NOCASE ASC, id ASC
         LIMIT ?`,
      )
      .all(ownerId, input.includeArchived ? 1 : 0, limit) as SkillRow[];

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      status: row.status,
      canonicalSkillId: this.resolveCanonicalSkillId(ownerId, row.id),
      aliases: this.listActiveAliases(ownerId, row.id),
      updatedAt: row.updated_at,
      version: row.version,
    }));
  }

  private goalSummaryFromRow(
    row: GoalRow,
    suppliedCheckpoints?: readonly LearningCheckpointRead[],
    suppliedProgress?: GrowthProgressRead,
  ): LearningGoalSummaryRead {
    const checkpoints =
      suppliedCheckpoints ?? this.listGoalCheckpoints(row.id);
    const progress =
      suppliedProgress ?? progressFromCheckpoints(checkpoints).summary;
    const nextCheckpoint = checkpoints.find(
      (checkpoint) =>
        checkpoint.status === "pending" ||
        checkpoint.status === "in_progress",
    );
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      priority: row.priority,
      targetDate: row.target_date,
      progress,
      checkpointCount: checkpoints.length,
      nextCheckpoint:
        nextCheckpoint === undefined
          ? null
          : {
              id: nextCheckpoint.id,
              title: nextCheckpoint.title,
              status: nextCheckpoint.status as "pending" | "in_progress",
              dueDate: nextCheckpoint.dueDate,
            },
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  private listGoalCheckpoints(
    goalId: string,
  ): readonly LearningCheckpointRead[] {
    const rows = this.database.$client
      .prepare(
        `SELECT id, goal_id, title, description, status, required, sequence,
                weight, completion_mode, numeric_unit, numeric_target,
                accepted_value, due_date, updated_at, version
         FROM learning_checkpoints
         WHERE goal_id = ?
         ORDER BY sequence ASC, id ASC`,
      )
      .all(goalId) as CheckpointRow[];
    return rows.map(checkpointFromRow);
  }

  private listDueCheckpoints(
    ownerId: string,
    limit: number,
  ): readonly LearningCheckpointSummaryRead[] {
    const rows = this.database.$client
      .prepare(
        `SELECT checkpoint.id,
                checkpoint.goal_id,
                checkpoint.title,
                checkpoint.description,
                checkpoint.status,
                checkpoint.required,
                checkpoint.sequence,
                checkpoint.weight,
                checkpoint.completion_mode,
                checkpoint.numeric_unit,
                checkpoint.numeric_target,
                checkpoint.accepted_value,
                checkpoint.due_date,
                checkpoint.updated_at,
                checkpoint.version,
                goal.title AS goal_title
         FROM learning_checkpoints AS checkpoint
         INNER JOIN learning_goals AS goal ON goal.id = checkpoint.goal_id
         WHERE goal.owner_id = ?
           AND goal.status IN ('active', 'paused')
           AND checkpoint.status IN ('pending', 'in_progress')
           AND checkpoint.due_date IS NOT NULL
         ORDER BY checkpoint.due_date ASC,
                  checkpoint.sequence ASC,
                  checkpoint.id ASC
         LIMIT ?`,
      )
      .all(ownerId, limit) as DueCheckpointRow[];

    return rows.map((row) => {
      completionModeFromRow(row);
      if (row.due_date === null) {
        throw new Error("GROWTH_CHECKPOINT_ROW_INVALID");
      }
      return {
        id: row.id,
        goalId: row.goal_id,
        goalTitle: row.goal_title,
        title: row.title,
        status: row.status,
        required: row.required === 1,
        sequence: row.sequence,
        weight: row.weight,
        dueDate: row.due_date,
      };
    });
  }

  private resolveCanonicalSkillId(ownerId: string, skillId: string): string {
    let currentId: string | null = skillId;
    const visited = new Set<string>();

    for (let depth = 0; depth < 100 && currentId !== null; depth += 1) {
      if (visited.has(currentId)) {
        throw new Error("GROWTH_SKILL_ALIAS_INVALID");
      }
      visited.add(currentId);
      const row = this.database.$client
        .prepare(
          `SELECT status, merged_into_skill_id
           FROM skills
           WHERE id = ? AND owner_id = ?`,
        )
        .get(currentId, ownerId) as
        | {
            status: "active" | "archived" | "merged";
            merged_into_skill_id: string | null;
          }
        | undefined;
      if (row === undefined) throw new Error("GROWTH_SKILL_ALIAS_INVALID");
      if (row.status !== "merged") return currentId;
      if (row.merged_into_skill_id === null) {
        throw new Error("GROWTH_SKILL_ALIAS_INVALID");
      }
      currentId = row.merged_into_skill_id;
    }

    throw new Error("GROWTH_SKILL_ALIAS_INVALID");
  }

  private listActiveAliases(
    ownerId: string,
    skillId: string,
  ): readonly string[] {
    const rows = this.database.$client
      .prepare(
        `SELECT current.alias_slug
         FROM skill_alias_events AS current
         WHERE current.owner_id = ?
           AND current.skill_id = ?
           AND current.action = 'created'
           AND current.sequence = (
             SELECT MAX(latest.sequence)
             FROM skill_alias_events AS latest
             WHERE latest.owner_id = current.owner_id
               AND latest.alias_slug = current.alias_slug
           )
         ORDER BY current.alias_slug ASC`,
      )
      .all(ownerId, skillId) as { alias_slug: string }[];
    return rows.map((row) => row.alias_slug);
  }
}
