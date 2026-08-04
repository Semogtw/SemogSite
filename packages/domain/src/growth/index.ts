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
  AddLearningCheckpointRecord,
  CreateLearningGoalRecord,
  CreateSkillRecord,
  GrowthClock,
  GrowthDomainEvent,
  GrowthIdGenerator,
  GrowthMutationContext,
  GrowthWriteResult,
  LearningCheckpointRepository,
  LearningGoalRepository,
  ReorderLearningCheckpointsRecord,
  SkillRepository,
  UpdateLearningCheckpointRecord,
  UpdateLearningGoalRecord,
  UpdateSkillRecord,
} from "./ports";
export type {
  CheckpointProgressInput,
  GoalProgressExplanation,
  GoalProgressProjection,
} from "./progress";
export { deriveGoalProgress } from "./progress";
export type {
  CheckpointWeightInput,
  CheckpointWeightProposal,
} from "./checkpoint-weights";
export {
  distributeEqualIntegerWeights,
  proposeCheckpointWeightRebalance,
} from "./checkpoint-weights";
export type {
  LearningGoalTemplate,
  LearningGoalTemplateCheckpoint,
  LearningGoalTemplateId,
  MaterializedLearningGoalTemplate,
} from "./goal-templates";
export {
  listLearningGoalTemplates,
  materializeLearningGoalTemplate,
} from "./goal-templates";
export type {
  QuickCreateLearningGoalDraft,
  QuickCreateLearningGoalInput,
} from "./quick-create";
export { prepareQuickLearningGoalDraft } from "./quick-create";
export type {
  CreateLearningGoalInput,
  LearningGoalServiceResult,
  LearningGoalTransitionAction,
  LearningGoalValidationError,
  TransitionLearningGoalInput,
} from "./goal-service";
export { LearningGoalService } from "./goal-service";
export type {
  AddLearningCheckpointInput,
  LearningCheckpointMutationResult,
  LearningCheckpointReorderResult,
  LearningCheckpointTransitionAction,
  LearningCheckpointValidationError,
  RecordLearningCheckpointValueInput,
  ReorderLearningCheckpointsInput,
  TransitionLearningCheckpointInput,
} from "./checkpoint-service";
export { LearningCheckpointService } from "./checkpoint-service";
export type {
  ArchiveSkillInput,
  CreateSkillInput,
  LinkCheckpointSkillInput,
  LinkGoalSkillInput,
  MergeSkillInput,
  SkillLinkResult,
  SkillMutationResult,
  SkillValidationError,
} from "./skill-service";
export { SkillService } from "./skill-service";
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
