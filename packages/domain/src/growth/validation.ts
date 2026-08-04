import type {
  CheckpointCompletionMode,
  LearningCheckpointStatus,
  LearningGoalStatus,
  SkillStage,
} from "./model";

const LEARNING_GOAL_STATUSES = new Set<LearningGoalStatus>([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
]);

const LEARNING_CHECKPOINT_STATUSES = new Set<LearningCheckpointStatus>([
  "pending",
  "in_progress",
  "completed",
  "waived",
  "cancelled",
]);

const SKILL_STAGES = new Set<SkillStage>([
  "introduced",
  "practicing",
  "applied",
  "demonstrated",
]);

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function canonicalSlug(value: string, prefix: string): string {
  if (typeof value !== "string") {
    fail(`${prefix}_REQUIRED`);
  }

  const normalized = value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (normalized.length === 0) {
    fail(`${prefix}_REQUIRED`);
  }

  if (normalized.length > 120) {
    fail(`${prefix}_TOO_LONG`);
  }

  return normalized;
}

export function normalizeLearningGoalTitle(value: string): string {
  if (typeof value !== "string") {
    fail("LEARNING_GOAL_TITLE_REQUIRED");
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    fail("LEARNING_GOAL_TITLE_REQUIRED");
  }
  if (normalized.length > 160) {
    fail("LEARNING_GOAL_TITLE_TOO_LONG");
  }
  return normalized;
}

export function normalizeLearningGoalSlug(value: string): string {
  return canonicalSlug(value, "LEARNING_GOAL_SLUG");
}

export function normalizeCheckpointWeight(value: number): number {
  if (!Number.isFinite(value)) {
    fail("CHECKPOINT_WEIGHT_MUST_BE_FINITE");
  }
  if (!Number.isInteger(value)) {
    fail("CHECKPOINT_WEIGHT_MUST_BE_INTEGER");
  }
  if (value < 1 || value > 100) {
    fail("CHECKPOINT_WEIGHT_OUT_OF_RANGE");
  }
  return value;
}

export function validateCompletionMode(
  value: unknown,
): CheckpointCompletionMode {
  if (!isPlainObject(value) || typeof value.kind !== "string") {
    fail("CHECKPOINT_COMPLETION_MODE_INVALID");
  }

  if (value.kind === "binary") {
    if (!hasOnlyKeys(value, ["kind"])) {
      fail("CHECKPOINT_COMPLETION_MODE_INVALID");
    }
    return { kind: "binary" };
  }

  if (value.kind !== "numeric" || !hasOnlyKeys(value, ["kind", "unit", "target"])) {
    fail("CHECKPOINT_COMPLETION_MODE_INVALID");
  }

  if (typeof value.unit !== "string") {
    fail("CHECKPOINT_NUMERIC_UNIT_REQUIRED");
  }
  const unit = value.unit.trim();
  if (unit.length === 0) {
    fail("CHECKPOINT_NUMERIC_UNIT_REQUIRED");
  }
  if (unit.length > 40) {
    fail("CHECKPOINT_NUMERIC_UNIT_TOO_LONG");
  }

  if (typeof value.target !== "number" || !Number.isFinite(value.target)) {
    fail("CHECKPOINT_NUMERIC_TARGET_MUST_BE_FINITE");
  }
  if (value.target <= 0) {
    fail("CHECKPOINT_NUMERIC_TARGET_MUST_BE_POSITIVE");
  }

  return {
    kind: "numeric",
    unit,
    target: value.target,
  };
}

export function normalizeSkillSlug(value: string): string {
  return canonicalSlug(value, "SKILL_SLUG");
}

export function validateLearningGoalStatus(
  value: unknown,
): LearningGoalStatus {
  if (typeof value !== "string" || !LEARNING_GOAL_STATUSES.has(value as LearningGoalStatus)) {
    fail("LEARNING_GOAL_STATUS_INVALID");
  }
  return value as LearningGoalStatus;
}

export function validateLearningCheckpointStatus(
  value: unknown,
): LearningCheckpointStatus {
  if (
    typeof value !== "string" ||
    !LEARNING_CHECKPOINT_STATUSES.has(value as LearningCheckpointStatus)
  ) {
    fail("LEARNING_CHECKPOINT_STATUS_INVALID");
  }
  return value as LearningCheckpointStatus;
}

export function validateSkillStage(value: unknown): SkillStage {
  if (typeof value !== "string" || !SKILL_STAGES.has(value as SkillStage)) {
    fail("SKILL_STAGE_INVALID");
  }
  return value as SkillStage;
}

export function validateIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    fail("ISO_TIMESTAMP_INVALID");
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    fail("ISO_TIMESTAMP_INVALID");
  }

  return value;
}
