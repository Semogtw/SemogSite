export type {
  CheckpointCompletionMode,
  LearningCheckpointRecord,
  LearningCheckpointSkillLink,
  LearningCheckpointStatus,
  LearningGoalAggregate,
  LearningGoalRecord,
  LearningGoalSkillLink,
  LearningGoalStatus,
  SkillRecord,
  SkillStage,
} from "./model";
export type {
  CheckpointProgressInput,
  GoalProgressExplanation,
  GoalProgressProjection,
} from "./progress";
export { deriveGoalProgress } from "./progress";
export {
  normalizeCheckpointWeight,
  normalizeLearningGoalSlug,
  normalizeLearningGoalTitle,
  normalizeSkillSlug,
  validateCompletionMode,
  validateIsoTimestamp,
  validateLearningCheckpointStatus,
  validateLearningGoalStatus,
  validateSkillStage,
} from "./validation";
