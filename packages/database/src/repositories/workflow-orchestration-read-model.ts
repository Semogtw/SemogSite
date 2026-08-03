import type {
  ScopeReservationKind,
  ScopeReservationState,
  VerificationFailureClassification,
  VerificationObligationStatus,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";

export type WorkflowReservationView = {
  id: string;
  projectId: string | null;
  repositoryId: string;
  repositoryFullName: string;
  runId: string | null;
  branch: string;
  kind: ScopeReservationKind;
  patterns: readonly string[];
  holderLabel: string;
  purpose: string;
  persistedState: ScopeReservationState;
  freshness: "active" | "expired" | "inactive";
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  releasedAt: string | null;
  version: number;
};

export type WorkflowVerificationView = {
  id: string;
  projectId: string | null;
  repositoryId: string;
  repositoryFullName: string;
  runId: string | null;
  stageId: string | null;
  branch: string;
  targetCommitSha: string;
  gateName: string;
  command: string;
  requiredCapabilities: readonly string[];
  responsibleActor: string;
  nextAction: string;
  toolchainManifest: string | null;
  status: VerificationObligationStatus;
  failureClassification: VerificationFailureClassification | null;
  failureSignature: string | null;
  resultSummary: string | null;
  evidenceUrls: readonly string[];
  createdAt: string;
  lastAttemptAt: string | null;
  resolvedAt: string | null;
  version: number;
};

export type WorkflowOrchestrationDashboard = {
  observedAt: string;
  summary: {
    activeReservations: number;
    expiredReservations: number;
    unresolvedObligations: number;
    environmentBlockedObligations: number;
  };
  reservations: readonly WorkflowReservationView[];
  obligations: readonly WorkflowVerificationView[];
};

type ReservationRow = {
  id: string;
  project_id: string | null;
  repository_id: string;
  repository_full_name: string;
  run_id: string | null;
  branch: string;
  kind: ScopeReservationKind;
  patterns_json: string;
  holder_label: string;
  purpose: string;
  state: ScopeReservationState;
  acquired_at: string;
  renewed_at: string;
  expires_at: string;
  released_at: string | null;
  version: number;
};

type ObligationRow = {
  id: string;
  project_id: string | null;
  repository_id: string;
  repository_full_name: string;
  run_id: string | null;
  stage_id: string | null;
  branch: string;
  target_commit_sha: string;
  gate_name: string;
  command: string;
  required_capabilities_json: string;
  responsible_actor: string;
  next_action: string;
  toolchain_manifest: string | null;
  status: VerificationObligationStatus;
  failure_classification: VerificationFailureClassification | null;
  failure_signature: string | null;
  result_summary: string | null;
  evidence_urls_json: string;
  created_at: string;
  last_attempt_at: string | null;
  resolved_at: string | null;
  version: number;
};

const unresolvedStatuses = new Set<VerificationObligationStatus>([
  "pending",
  "running",
  "failed",
  "blocked",
]);

const obligationStatusRank: Record<VerificationObligationStatus, number> = {
  blocked: 0,
  failed: 1,
  running: 2,
  pending: 3,
  passed: 4,
  waived: 5,
  superseded: 6,
};

function normalizeIso(value: string): string {
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    throw new Error("WORKFLOW_ORCHESTRATION_OBSERVED_AT_INVALID");
  }
  return new Date(epoch).toISOString();
}

function parseStringArray(value: string): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function reservationFreshness(
  row: ReservationRow,
  observedAt: string,
): WorkflowReservationView["freshness"] {
  if (row.state !== "active") return "inactive";
  return Date.parse(row.expires_at) <= Date.parse(observedAt)
    ? "expired"
    : "active";
}

function reservationView(
  row: ReservationRow,
  observedAt: string,
): WorkflowReservationView {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    repositoryFullName: row.repository_full_name,
    runId: row.run_id,
    branch: row.branch,
    kind: row.kind,
    patterns: parseStringArray(row.patterns_json),
    holderLabel: row.holder_label,
    purpose: row.purpose,
    persistedState: row.state,
    freshness: reservationFreshness(row, observedAt),
    acquiredAt: row.acquired_at,
    renewedAt: row.renewed_at,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
    version: row.version,
  };
}

function obligationView(row: ObligationRow): WorkflowVerificationView {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    repositoryFullName: row.repository_full_name,
    runId: row.run_id,
    stageId: row.stage_id,
    branch: row.branch,
    targetCommitSha: row.target_commit_sha,
    gateName: row.gate_name,
    command: row.command,
    requiredCapabilities: parseStringArray(row.required_capabilities_json),
    responsibleActor: row.responsible_actor,
    nextAction: row.next_action,
    toolchainManifest: row.toolchain_manifest,
    status: row.status,
    failureClassification: row.failure_classification,
    failureSignature: row.failure_signature,
    resultSummary: row.result_summary,
    evidenceUrls: parseStringArray(row.evidence_urls_json),
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at,
    resolvedAt: row.resolved_at,
    version: row.version,
  };
}

export class SqliteWorkflowOrchestrationReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async getDashboard(observedAtValue: string): Promise<WorkflowOrchestrationDashboard> {
    const observedAt = normalizeIso(observedAtValue);
    const reservationRows = this.database.$client
      .prepare(
        `SELECT sr.id, sr.project_id, sr.repository_id,
                r.full_name AS repository_full_name, sr.run_id, sr.branch,
                sr.kind, sr.patterns_json, sr.holder_label, sr.purpose,
                sr.state, sr.acquired_at, sr.renewed_at, sr.expires_at,
                sr.released_at, sr.version
         FROM scope_reservations sr
         JOIN repositories r ON r.id = sr.repository_id
         ORDER BY sr.renewed_at DESC, sr.id ASC
         LIMIT 100`,
      )
      .all() as ReservationRow[];
    const obligationRows = this.database.$client
      .prepare(
        `SELECT vo.id, vo.project_id, vo.repository_id,
                r.full_name AS repository_full_name, vo.run_id, vo.stage_id,
                vo.branch, vo.target_commit_sha, vo.gate_name, vo.command,
                vo.required_capabilities_json, vo.responsible_actor,
                vo.next_action, vo.toolchain_manifest, vo.status,
                vo.failure_classification, vo.failure_signature,
                vo.result_summary, vo.evidence_urls_json, vo.created_at,
                vo.last_attempt_at, vo.resolved_at, vo.version
         FROM verification_obligations vo
         JOIN repositories r ON r.id = vo.repository_id
         ORDER BY vo.created_at DESC, vo.id ASC
         LIMIT 100`,
      )
      .all() as ObligationRow[];

    const reservations = reservationRows
      .map((row) => reservationView(row, observedAt))
      .sort((left, right) => {
        const freshnessRank = { active: 0, expired: 1, inactive: 2 } as const;
        return (
          freshnessRank[left.freshness] - freshnessRank[right.freshness] ||
          right.renewedAt.localeCompare(left.renewedAt) ||
          left.id.localeCompare(right.id)
        );
      });
    const obligations = obligationRows
      .map(obligationView)
      .sort(
        (left, right) =>
          obligationStatusRank[left.status] - obligationStatusRank[right.status] ||
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      );

    return {
      observedAt,
      summary: {
        activeReservations: reservations.filter(
          (item) => item.freshness === "active",
        ).length,
        expiredReservations: reservations.filter(
          (item) => item.freshness === "expired",
        ).length,
        unresolvedObligations: obligations.filter((item) =>
          unresolvedStatuses.has(item.status),
        ).length,
        environmentBlockedObligations: obligations.filter(
          (item) =>
            item.status === "blocked" &&
            item.failureClassification === "environment_missing",
        ).length,
      },
      reservations,
      obligations,
    };
  }
}
