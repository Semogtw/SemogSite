import type {
  RecoverySnapshotInput,
  RecoveryTestStatus,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";
import { SqliteWorkflowOrchestrationReadModel } from "./workflow-orchestration-read-model";

export type RecoverySnapshotSourceInput = {
  snapshotId: string;
  repositoryId: string;
  generatedAt: string;
  nextAction: string;
  continuationPrompt: string;
  runtimeLabel: string;
  runtimeCapabilities: readonly string[];
  toolchainManifest: string | null;
  planPath: string | null;
  planSection: string | null;
};

export type RecoverySnapshotSourceResult =
  | { ok: true; input: RecoverySnapshotInput }
  | {
      ok: false;
      code:
        | "GENERATED_AT_INVALID"
        | "REPOSITORY_NOT_FOUND"
        | "PROJECT_NOT_FOUND"
        | "BRANCH_OBSERVATION_NOT_FOUND";
    };

type RepositoryProjectRow = {
  repository_id: string;
  project_id: string | null;
  full_name: string;
  default_branch: string;
  active_branch: string | null;
  project_slug: string | null;
  project_name: string | null;
};

type BranchObservationRow = {
  head_sha: string;
  observed_at: string;
};

function normalizeIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function confidenceForAge(
  sourceObservedAt: string,
  generatedAt: string,
): RecoverySnapshotInput["confidence"] {
  const age = Math.max(0, Date.parse(generatedAt) - Date.parse(sourceObservedAt));
  if (age <= 60 * 60 * 1_000) return "high";
  if (age <= 24 * 60 * 60 * 1_000) return "medium";
  return "low";
}

function testStatus(status: string): RecoveryTestStatus | null {
  if (status === "pending") return "not_run";
  if (status === "running") return "partial";
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  return null;
}

export class SqliteRecoverySnapshotSource {
  constructor(private readonly database: SqliteDatabase) {}

  async build(
    request: RecoverySnapshotSourceInput,
  ): Promise<RecoverySnapshotSourceResult> {
    const generatedAt = normalizeIso(request.generatedAt);
    if (generatedAt === null) {
      return { ok: false, code: "GENERATED_AT_INVALID" };
    }

    const repository = this.database.$client
      .prepare(
        `SELECT r.id AS repository_id,
                r.project_id,
                r.full_name,
                r.default_branch,
                r.active_branch,
                p.slug AS project_slug,
                p.name AS project_name
         FROM repositories r
         LEFT JOIN projects p ON p.id = r.project_id
         WHERE r.id = ? AND r.status = 'active'`,
      )
      .get(text(request.repositoryId)) as RepositoryProjectRow | undefined;
    if (repository === undefined) {
      return { ok: false, code: "REPOSITORY_NOT_FOUND" };
    }
    if (
      repository.project_id === null ||
      repository.project_slug === null ||
      repository.project_name === null
    ) {
      return { ok: false, code: "PROJECT_NOT_FOUND" };
    }

    const branch = repository.active_branch ?? repository.default_branch;
    const observation = this.database.$client
      .prepare(
        `SELECT gbo.head_sha,
                gro.observed_at
         FROM github_branch_observations gbo
         JOIN github_repository_observations gro
           ON gro.id = gbo.repository_observation_id
         WHERE gro.repository_id = ? AND gbo.name = ?
         ORDER BY gro.observed_at DESC, gro.id DESC, gbo.id DESC
         LIMIT 1`,
      )
      .get(repository.repository_id, branch) as BranchObservationRow | undefined;
    if (observation === undefined) {
      return { ok: false, code: "BRANCH_OBSERVATION_NOT_FOUND" };
    }

    const sourceObservedAt = normalizeIso(observation.observed_at);
    if (sourceObservedAt === null) {
      return { ok: false, code: "BRANCH_OBSERVATION_NOT_FOUND" };
    }

    const dashboard = await new SqliteWorkflowOrchestrationReadModel(
      this.database,
    ).getDashboard(generatedAt);
    const reservations = dashboard.reservations
      .filter(
        (item) =>
          item.repositoryId === repository.repository_id &&
          item.branch === branch &&
          item.persistedState === "active",
      )
      .map((item) => ({
        id: item.id,
        repositoryId: item.repositoryId,
        branch: item.branch,
        patterns: item.patterns,
        holderLabel: item.holderLabel,
        expiresAt: item.expiresAt,
      }));
    const repositoryObligations = dashboard.obligations.filter(
      (item) =>
        item.repositoryId === repository.repository_id && item.branch === branch,
    );
    const obligations = repositoryObligations.map((item) => ({
      id: item.id,
      gateName: item.gateName,
      status: item.status,
      nextAction: item.nextAction,
    }));
    const tests = repositoryObligations.flatMap((item) => {
      const status = testStatus(item.status);
      if (status === null) return [];
      return [
        {
          gateName: item.gateName,
          status,
          summary:
            item.resultSummary ??
            (status === "not_run"
              ? "Gate ainda não executado."
              : "Resultado detalhado ainda não registrado."),
        },
      ];
    });
    const blockers = repositoryObligations
      .filter((item) => item.status === "blocked" || item.status === "failed")
      .map(
        (item) =>
          `${item.gateName}: ${item.resultSummary ?? item.nextAction}`,
      );
    const confidence = confidenceForAge(sourceObservedAt, generatedAt);
    const warnings =
      confidence === "high"
        ? []
        : [
            confidence === "medium"
              ? "A observação da branch tem mais de uma hora."
              : "A observação da branch tem mais de 24 horas e deve ser atualizada antes de mudanças críticas.",
          ];
    const plan =
      request.planPath === null || request.planSection === null
        ? null
        : {
            path: text(request.planPath),
            section: text(request.planSection),
          };

    return {
      ok: true,
      input: {
        snapshotId: text(request.snapshotId),
        generatedAt,
        sourceObservedAt,
        confidence,
        project: {
          id: repository.project_id,
          slug: repository.project_slug,
          name: repository.project_name,
        },
        repository: {
          id: repository.repository_id,
          fullName: repository.full_name,
          branch,
          observedCommitSha: observation.head_sha,
        },
        run: null,
        stage: null,
        plan,
        commits: [
          {
            sha: observation.head_sha,
            message: "Observed branch head",
          },
        ],
        pushState: "confirmed",
        tests,
        obligations,
        reservations,
        blockers,
        decisions: [
          "Snapshot generated from persisted DevOS and GitHub observations.",
        ],
        nextAction: text(request.nextAction),
        requiredDocuments: plan === null ? [] : [plan.path],
        runtime: {
          label: text(request.runtimeLabel),
          capabilities: request.runtimeCapabilities,
          toolchainManifest:
            request.toolchainManifest === null
              ? null
              : text(request.toolchainManifest),
        },
        continuation: {
          templateId: "workflow-resume",
          templateVersion: 1,
          prompt: text(request.continuationPrompt),
        },
        warnings,
      },
    };
  }
}
