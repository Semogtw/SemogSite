import {
  SafeWorkService,
  type SafeWorkEvaluationResult,
  type SafeWorkExclusion,
  type SafeWorkRecommendation,
  type ScopeReservationSnapshot,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";
import { SqliteWorkflowOrchestrationReadModel } from "./workflow-orchestration-read-model";

export type SafeWorkSourceInput = {
  observedAt: string;
  availableCapabilities: readonly string[];
  defaultEstimatedMinutes: number;
};

export type SafeWorkSourceExclusionCode =
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_AMBIGUOUS"
  | "PREVIOUS_STAGE_INCOMPLETE";

export type SafeWorkSourceExclusion = {
  stageId: string;
  projectId: string;
  code: SafeWorkSourceExclusionCode;
  details: readonly string[];
};

export type SafeWorkSourceError =
  | "OBSERVED_AT_INVALID"
  | "DEFAULT_ESTIMATE_INVALID";

export type SafeWorkSourceResult = {
  observedAt: string | null;
  recommendations: readonly SafeWorkRecommendation[];
  exclusions: readonly SafeWorkExclusion[];
  sourceExclusions: readonly SafeWorkSourceExclusion[];
  errors: readonly SafeWorkSourceError[];
};

type StageRow = {
  id: string;
  project_id: string;
  order_index: number;
  title: string;
  state: "backlog" | "next" | "in_progress" | "blocked";
  stage_manual_lock: number;
  stage_updated_at: string;
  project_priority: "critical" | "high" | "medium" | "low";
  project_health: "healthy" | "attention" | "blocked" | "unknown";
  project_confidence: "high" | "medium" | "low";
  project_manual_lock: number;
  project_updated_at: string;
};

type RepositoryRow = {
  id: string;
  project_id: string;
  default_branch: string;
  active_branch: string | null;
  updated_at: string;
};

const unresolvedStatuses = new Set(["pending", "running", "failed", "blocked"]);

function normalizeIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function oldestObservedAt(values: readonly string[]): string {
  return [...values].sort(
    (left, right) => Date.parse(left) - Date.parse(right),
  )[0] as string;
}

function riskForHealth(
  health: StageRow["project_health"],
): "low" | "medium" | "high" {
  if (health === "healthy") return "low";
  if (health === "blocked") return "high";
  return "medium";
}

function reservationSnapshot(
  reservation: Awaited<
    ReturnType<SqliteWorkflowOrchestrationReadModel["getDashboard"]>
  >["reservations"][number],
): ScopeReservationSnapshot {
  return {
    id: reservation.id,
    projectId: reservation.projectId,
    repositoryId: reservation.repositoryId,
    runId: reservation.runId,
    branch: reservation.branch,
    kind: reservation.kind,
    patterns: reservation.patterns,
    holderLabel: reservation.holderLabel,
    purpose: reservation.purpose,
    state: reservation.persistedState,
    acquiredAt: reservation.acquiredAt,
    renewedAt: reservation.renewedAt,
    expiresAt: reservation.expiresAt,
    releasedAt: reservation.releasedAt,
    version: reservation.version,
  };
}

function evaluationErrors(
  evaluation: SafeWorkEvaluationResult,
): readonly SafeWorkSourceError[] {
  return evaluation.ok ? [] : evaluation.errors;
}

export class SqliteSafeWorkSource {
  constructor(private readonly database: SqliteDatabase) {}

  async evaluate(input: SafeWorkSourceInput): Promise<SafeWorkSourceResult> {
    const observedAt = normalizeIso(input.observedAt);
    const errors: SafeWorkSourceError[] = [];
    if (observedAt === null) errors.push("OBSERVED_AT_INVALID");
    if (
      !Number.isInteger(input.defaultEstimatedMinutes) ||
      input.defaultEstimatedMinutes < 1 ||
      input.defaultEstimatedMinutes > 8 * 60
    ) {
      errors.push("DEFAULT_ESTIMATE_INVALID");
    }
    if (errors.length > 0 || observedAt === null) {
      return {
        observedAt,
        recommendations: [],
        exclusions: [],
        sourceExclusions: [],
        errors,
      };
    }

    const stageRows = this.database.$client
      .prepare(
        `SELECT s.id,
                s.project_id,
                s.order_index,
                s.title,
                s.state,
                s.manual_lock AS stage_manual_lock,
                s.updated_at AS stage_updated_at,
                p.priority AS project_priority,
                p.health AS project_health,
                p.confidence AS project_confidence,
                p.manual_lock AS project_manual_lock,
                p.updated_at AS project_updated_at
         FROM stages s
         JOIN projects p ON p.id = s.project_id
         WHERE s.done = 0
           AND s.state <> 'completed'
           AND p.status IN ('planning', 'active')
           AND p.data_source <> 'seed_demo'
         ORDER BY s.project_id ASC, s.order_index ASC, s.id ASC`,
      )
      .all() as StageRow[];
    const repositoryRows = this.database.$client
      .prepare(
        `SELECT id, project_id, default_branch, active_branch, updated_at
         FROM repositories
         WHERE status = 'active' AND project_id IS NOT NULL
         ORDER BY project_id ASC, id ASC`,
      )
      .all() as RepositoryRow[];

    const repositoriesByProject = new Map<string, RepositoryRow[]>();
    for (const repository of repositoryRows) {
      const repositories = repositoriesByProject.get(repository.project_id) ?? [];
      repositories.push(repository);
      repositoriesByProject.set(repository.project_id, repositories);
    }

    const stagesByProject = new Map<string, StageRow[]>();
    for (const stage of stageRows) {
      const stages = stagesByProject.get(stage.project_id) ?? [];
      stages.push(stage);
      stagesByProject.set(stage.project_id, stages);
    }

    const dashboard = await new SqliteWorkflowOrchestrationReadModel(
      this.database,
    ).getDashboard(observedAt);
    const candidates = [] as Parameters<SafeWorkService["evaluate"]>[0]["candidates"] extends readonly (infer Candidate)[]
      ? Candidate[]
      : never;
    const sourceExclusions: SafeWorkSourceExclusion[] = [];

    for (const [projectId, stages] of [...stagesByProject.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const currentStage = stages[0];
      if (currentStage === undefined) continue;
      for (const laterStage of stages.slice(1)) {
        sourceExclusions.push({
          stageId: laterStage.id,
          projectId,
          code: "PREVIOUS_STAGE_INCOMPLETE",
          details: [currentStage.id],
        });
      }

      const repositories = repositoriesByProject.get(projectId) ?? [];
      if (repositories.length === 0) {
        sourceExclusions.push({
          stageId: currentStage.id,
          projectId,
          code: "REPOSITORY_NOT_FOUND",
          details: [],
        });
        continue;
      }
      if (repositories.length > 1) {
        sourceExclusions.push({
          stageId: currentStage.id,
          projectId,
          code: "REPOSITORY_AMBIGUOUS",
          details: repositories.map((repository) => repository.id),
        });
        continue;
      }

      const repository = repositories[0] as RepositoryRow;
      const unresolvedStageObligations = dashboard.obligations.filter(
        (obligation) =>
          obligation.stageId === currentStage.id &&
          unresolvedStatuses.has(obligation.status),
      );
      const requiredCapabilities = [
        ...new Set(
          unresolvedStageObligations.flatMap(
            (obligation) => obligation.requiredCapabilities,
          ),
        ),
      ].sort((left, right) => left.localeCompare(right));

      candidates.push({
        id: currentStage.id,
        projectId,
        repositoryId: repository.id,
        stageId: currentStage.id,
        title: currentStage.title,
        branch: repository.active_branch ?? repository.default_branch,
        scopePatterns: ["**"],
        priority: currentStage.project_priority,
        state: currentStage.state,
        dependencies: [],
        requiredCapabilities,
        ownerDecisionRequired:
          currentStage.project_manual_lock === 1 ||
          currentStage.stage_manual_lock === 1,
        estimatedMinutes: input.defaultEstimatedMinutes,
        risk: riskForHealth(currentStage.project_health),
        confidence: currentStage.project_confidence,
        sourceObservedAt: oldestObservedAt([
          currentStage.project_updated_at,
          currentStage.stage_updated_at,
          repository.updated_at,
        ]),
      });
    }

    const evaluation = new SafeWorkService().evaluate({
      observedAt,
      availableCapabilities: input.availableCapabilities,
      candidates,
      reservations: dashboard.reservations.map(reservationSnapshot),
      verificationObligations: dashboard.obligations.map((obligation) => ({
        id: obligation.id,
        stageId: obligation.stageId,
        status: obligation.status,
        gateName: obligation.gateName,
        requiredBeforeWork: obligation.stageId !== null,
      })),
    });

    return {
      observedAt: evaluation.ok ? evaluation.observedAt : null,
      recommendations: evaluation.recommendations,
      exclusions: evaluation.exclusions,
      sourceExclusions: sourceExclusions.sort(
        (left, right) =>
          left.projectId.localeCompare(right.projectId) ||
          left.stageId.localeCompare(right.stageId),
      ),
      errors: evaluationErrors(evaluation),
    };
  }
}
