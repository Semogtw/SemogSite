import type { IsoTimestamp, Priority } from "../shared/types";

export type LearningGoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type LearningCheckpointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "waived"
  | "cancelled";

export type CheckpointCompletionMode =
  | { kind: "binary" }
  | { kind: "numeric"; unit: string; target: number };

export type SkillStage =
  | "introduced"
  | "practicing"
  | "applied"
  | "demonstrated";

export type LearningGoalRecord = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  description: string;
  motivation: string | null;
  status: LearningGoalStatus;
  priority: Priority;
  targetDate: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  version: number;
};

export type LearningCheckpointRecord = {
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
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  version: number;
};

export type SkillRecord = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "archived" | "merged";
  mergedIntoSkillId: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  version: number;
};

export type LearningGoalSkillLink = {
  goalId: string;
  skillId: string;
  desiredStage: SkillStage;
  createdAt: IsoTimestamp;
};

export type LearningCheckpointSkillLink = {
  checkpointId: string;
  skillId: string;
  desiredStage: SkillStage;
  createdAt: IsoTimestamp;
};

export type LearningGoalAggregate = LearningGoalRecord & {
  checkpoints: readonly LearningCheckpointRecord[];
  skills: readonly LearningGoalSkillLink[];
};
