import type {
  ScopeReservationState,
  VerificationObligationStatus,
} from "@semogtw/domain/orchestration";
import { asc, desc, eq } from "drizzle-orm";
import type { SemogtwD1Database } from "../adapters/d1";
import { scopeReservations, verificationObligations } from "../schema/orchestration";
import { repositories } from "../schema/projects";
import type {
  WorkflowOrchestrationDashboard,
  WorkflowReservationView,
  WorkflowVerificationView,
} from "./workflow-orchestration-read-model";

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
  state: ScopeReservationState,
  expiresAt: string,
  observedAt: string,
): WorkflowReservationView["freshness"] {
  if (state !== "active") return "inactive";
  return Date.parse(expiresAt) <= Date.parse(observedAt) ? "expired" : "active";
}

export class D1WorkflowOrchestrationReadModel {
  constructor(private readonly database: SemogtwD1Database) {}

  async getDashboard(observedAtValue: string): Promise<WorkflowOrchestrationDashboard> {
    const observedAt = normalizeIso(observedAtValue);
    const [reservationRows, obligationRows] = await Promise.all([
      this.database
        .select({
          id: scopeReservations.id,
          projectId: scopeReservations.projectId,
          repositoryId: scopeReservations.repositoryId,
          repositoryFullName: repositories.fullName,
          runId: scopeReservations.runId,
          branch: scopeReservations.branch,
          kind: scopeReservations.kind,
          patternsJson: scopeReservations.patternsJson,
          holderLabel: scopeReservations.holderLabel,
          purpose: scopeReservations.purpose,
          state: scopeReservations.state,
          acquiredAt: scopeReservations.acquiredAt,
          renewedAt: scopeReservations.renewedAt,
          expiresAt: scopeReservations.expiresAt,
          releasedAt: scopeReservations.releasedAt,
          version: scopeReservations.version,
        })
        .from(scopeReservations)
        .innerJoin(repositories, eq(scopeReservations.repositoryId, repositories.id))
        .orderBy(desc(scopeReservations.renewedAt), asc(scopeReservations.id))
        .limit(100)
        .all(),
      this.database
        .select({
          id: verificationObligations.id,
          projectId: verificationObligations.projectId,
          repositoryId: verificationObligations.repositoryId,
          repositoryFullName: repositories.fullName,
          runId: verificationObligations.runId,
          stageId: verificationObligations.stageId,
          branch: verificationObligations.branch,
          targetCommitSha: verificationObligations.targetCommitSha,
          gateName: verificationObligations.gateName,
          command: verificationObligations.command,
          requiredCapabilitiesJson: verificationObligations.requiredCapabilitiesJson,
          responsibleActor: verificationObligations.responsibleActor,
          nextAction: verificationObligations.nextAction,
          toolchainManifest: verificationObligations.toolchainManifest,
          status: verificationObligations.status,
          failureClassification: verificationObligations.failureClassification,
          failureSignature: verificationObligations.failureSignature,
          resultSummary: verificationObligations.resultSummary,
          evidenceUrlsJson: verificationObligations.evidenceUrlsJson,
          createdAt: verificationObligations.createdAt,
          lastAttemptAt: verificationObligations.lastAttemptAt,
          resolvedAt: verificationObligations.resolvedAt,
          version: verificationObligations.version,
        })
        .from(verificationObligations)
        .innerJoin(repositories, eq(verificationObligations.repositoryId, repositories.id))
        .orderBy(desc(verificationObligations.createdAt), asc(verificationObligations.id))
        .limit(100)
        .all(),
    ]);

    const reservations: WorkflowReservationView[] = reservationRows
      .map((row) => ({
        id: row.id,
        projectId: row.projectId,
        repositoryId: row.repositoryId,
        repositoryFullName: row.repositoryFullName,
        runId: row.runId,
        branch: row.branch,
        kind: row.kind,
        patterns: parseStringArray(row.patternsJson),
        holderLabel: row.holderLabel,
        purpose: row.purpose,
        persistedState: row.state,
        freshness: reservationFreshness(row.state, row.expiresAt, observedAt),
        acquiredAt: row.acquiredAt,
        renewedAt: row.renewedAt,
        expiresAt: row.expiresAt,
        releasedAt: row.releasedAt,
        version: row.version,
      }))
      .sort((left, right) => {
        const freshnessRank = { active: 0, expired: 1, inactive: 2 } as const;
        return (
          freshnessRank[left.freshness] - freshnessRank[right.freshness] ||
          right.renewedAt.localeCompare(left.renewedAt) ||
          left.id.localeCompare(right.id)
        );
      });

    const obligations: WorkflowVerificationView[] = obligationRows
      .map((row) => ({
        id: row.id,
        projectId: row.projectId,
        repositoryId: row.repositoryId,
        repositoryFullName: row.repositoryFullName,
        runId: row.runId,
        stageId: row.stageId,
        branch: row.branch,
        targetCommitSha: row.targetCommitSha,
        gateName: row.gateName,
        command: row.command,
        requiredCapabilities: parseStringArray(row.requiredCapabilitiesJson),
        responsibleActor: row.responsibleActor,
        nextAction: row.nextAction,
        toolchainManifest: row.toolchainManifest,
        status: row.status,
        failureClassification: row.failureClassification,
        failureSignature: row.failureSignature,
        resultSummary: row.resultSummary,
        evidenceUrls: parseStringArray(row.evidenceUrlsJson),
        createdAt: row.createdAt,
        lastAttemptAt: row.lastAttemptAt,
        resolvedAt: row.resolvedAt,
        version: row.version,
      }))
      .sort(
        (left, right) =>
          obligationStatusRank[left.status] - obligationStatusRank[right.status] ||
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      );

    return {
      observedAt,
      summary: {
        activeReservations: reservations.filter((item) => item.freshness === "active").length,
        expiredReservations: reservations.filter((item) => item.freshness === "expired").length,
        unresolvedObligations: obligations.filter((item) => unresolvedStatuses.has(item.status)).length,
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
