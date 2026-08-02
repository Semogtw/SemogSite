import {
  isSafeGitRefName,
  parseGitHubRepositoryIdentity,
} from "./github-identifiers";
import { recommendActiveBranch, type BranchObservation } from "./repository-observation";
import type {
  ObservationInsertResult,
  RepositoryObservationAggregate,
} from "./repository-sync-record";

export type RepositorySyncTarget = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  currentActiveBranch: string | null;
};

export type ProviderRepositoryObservation = {
  githubNodeId: string;
  fullName: string;
  visibility: "public" | "private";
  defaultBranch: string;
  htmlUrl: string;
  archived: boolean;
  pushedAt: string | null;
  providerUpdatedAt: string;
  observedAt: string;
  apiVersion: string;
  etag: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  branchesTruncated: boolean;
  branches: readonly BranchObservation[];
  warnings: readonly string[];
  partial?: boolean;
};

export type RepositoryObservationFailure = {
  code:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "RATE_LIMITED"
    | "INVALID_RESPONSE"
    | "TRANSPORT_FAILURE"
    | "UNKNOWN_FAILURE";
  retryAt: string | null;
};

export type RepositoryObservationResult =
  | { ok: true; observation: ProviderRepositoryObservation }
  | { ok: false; failure: RepositoryObservationFailure };

export interface GitHubObservationSource {
  observe(
    target: RepositorySyncTarget,
    maxBranches: number,
  ): Promise<RepositoryObservationResult>;
}

export type GitHubSyncRunStart = {
  id: string;
  integration: "github";
  scope: "repositories";
  status: "running";
  startedAt: string;
};

export type GitHubSyncRunFinish = {
  id: string;
  status: "success" | "partial" | "failed";
  finishedAt: string;
  createdCount: number;
  updatedCount: 0;
  skippedCount: number;
  errorCount: number;
  warnings: readonly string[];
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  processedTargets: number;
};

export interface GitHubSyncStore {
  listTargets(limit: number): Promise<readonly RepositorySyncTarget[]>;
  startRun(run: GitHubSyncRunStart): Promise<void>;
  recordObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<ObservationInsertResult>;
  finishRun(run: GitHubSyncRunFinish): Promise<void>;
}

export interface SyncIdentityFactory {
  nextId(prefix: string): string;
  hash(value: string): string;
}

export type GitHubSyncContext = {
  runId: string;
  now: string;
  maxTargets?: number;
  maxBranches?: number;
  stabilityWindowHours?: number;
};

export type GitHubSyncSummary = GitHubSyncRunFinish;

function laterIso(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function lowerRateLimit(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function appendDistinct(target: string[], values: readonly string[]): void {
  const existing = new Set(target);
  for (const value of values) {
    if (existing.has(value)) continue;
    target.push(value);
    existing.add(value);
  }
}

function validIsoTimestamp(value: string | null): boolean {
  if (value === null) return true;
  const epoch = Date.parse(value);
  return !Number.isNaN(epoch);
}

function validSyncTarget(target: RepositorySyncTarget): boolean {
  const identity = parseGitHubRepositoryIdentity(target.fullName);
  return (
    target.id.trim().length > 0 &&
    identity !== null &&
    identity.fullName === target.fullName &&
    identity.owner === target.owner &&
    identity.name === target.name &&
    isSafeGitRefName(target.defaultBranch) &&
    (target.currentActiveBranch === null ||
      isSafeGitRefName(target.currentActiveBranch))
  );
}

function validCanonicalRepositoryUrl(
  value: string,
  fullName: string,
): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port.length === 0 &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.pathname === `/${fullName}` &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

type ProviderValidationWarning =
  | "INVALID_PROVIDER_IDENTITY"
  | "INVALID_PROVIDER_URL"
  | "INVALID_PROVIDER_DEFAULT_BRANCH"
  | "INVALID_PROVIDER_TIMESTAMP"
  | "INVALID_PROVIDER_NODE_ID"
  | "INVALID_PROVIDER_RATE_LIMIT";

function validateProviderObservation(
  target: RepositorySyncTarget,
  observation: ProviderRepositoryObservation,
): ProviderValidationWarning | null {
  const identity = parseGitHubRepositoryIdentity(observation.fullName);
  if (
    identity === null ||
    identity.fullName !== observation.fullName ||
    identity.fullName !== target.fullName
  ) {
    return "INVALID_PROVIDER_IDENTITY";
  }
  if (!validCanonicalRepositoryUrl(observation.htmlUrl, target.fullName)) {
    return "INVALID_PROVIDER_URL";
  }
  if (!isSafeGitRefName(observation.defaultBranch)) {
    return "INVALID_PROVIDER_DEFAULT_BRANCH";
  }
  if (
    !validIsoTimestamp(observation.providerUpdatedAt) ||
    !validIsoTimestamp(observation.observedAt) ||
    !validIsoTimestamp(observation.pushedAt) ||
    !validIsoTimestamp(observation.rateLimitResetAt)
  ) {
    return "INVALID_PROVIDER_TIMESTAMP";
  }
  if (observation.githubNodeId.trim().length === 0) {
    return "INVALID_PROVIDER_NODE_ID";
  }
  if (
    observation.rateLimitRemaining !== null &&
    (!Number.isInteger(observation.rateLimitRemaining) ||
      observation.rateLimitRemaining < 0)
  ) {
    return "INVALID_PROVIDER_RATE_LIMIT";
  }
  return null;
}

export class GitHubSyncService {
  constructor(
    private readonly store: GitHubSyncStore,
    private readonly source: GitHubObservationSource,
    private readonly identity: SyncIdentityFactory,
  ) {}

  async synchronize(context: GitHubSyncContext): Promise<GitHubSyncSummary> {
    const maxTargets = Math.min(100, Math.max(1, context.maxTargets ?? 50));
    const maxBranches = Math.min(100, Math.max(1, context.maxBranches ?? 25));
    const targets = await this.store.listTargets(maxTargets);
    await this.store.startRun({
      id: context.runId,
      integration: "github",
      scope: "repositories",
      status: "running",
      startedAt: context.now,
    });

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let rateLimitRemaining: number | null = null;
    let rateLimitResetAt: string | null = null;
    const warnings: string[] = [];

    if (targets.length === 0) {
      errorCount = 1;
      warnings.push("NO_SYNC_TARGETS");
    }

    for (const target of targets) {
      if (!validSyncTarget(target)) {
        errorCount += 1;
        warnings.push(`${target.id}:INVALID_SYNC_TARGET`);
        continue;
      }

      let result: RepositoryObservationResult;
      try {
        result = await this.source.observe(target, maxBranches);
      } catch {
        errorCount += 1;
        warnings.push(`${target.id}:UNKNOWN_FAILURE`);
        continue;
      }

      if (!result.ok) {
        errorCount += 1;
        warnings.push(`${target.id}:${result.failure.code}`);
        rateLimitResetAt = laterIso(
          rateLimitResetAt,
          result.failure.retryAt,
        );
        continue;
      }

      const provider = result.observation;
      const providerWarning = validateProviderObservation(target, provider);
      if (providerWarning !== null) {
        errorCount += 1;
        warnings.push(`${target.id}:${providerWarning}`);
        continue;
      }

      rateLimitRemaining = lowerRateLimit(
        rateLimitRemaining,
        provider.rateLimitRemaining,
      );
      rateLimitResetAt = laterIso(
        rateLimitResetAt,
        provider.rateLimitResetAt,
      );

      const recommendation = recommendActiveBranch({
        defaultBranch: provider.defaultBranch,
        currentActiveBranch: target.currentActiveBranch,
        branches: provider.branches,
        observedAt: provider.observedAt,
        ...(context.stabilityWindowHours === undefined
          ? {}
          : { stabilityWindowHours: context.stabilityWindowHours }),
      });

      const providerPartial = provider.partial === true;
      const recommendationPartial = recommendation.warnings.length > 0;
      const bounded = provider.branchesTruncated;
      let targetProblem = providerPartial || recommendationPartial || bounded;
      if (providerPartial) {
        warnings.push(`${target.id}:PARTIAL_OBSERVATION`);
      }
      if (recommendationPartial) {
        warnings.push(`${target.id}:PARTIAL_RECOMMENDATION_EVIDENCE`);
      }
      appendDistinct(
        warnings,
        provider.warnings.map((warning) => `${target.id}:${warning}`),
      );
      appendDistinct(
        warnings,
        recommendation.warnings.map((warning) => `${target.id}:${warning}`),
      );
      if (bounded) {
        appendDistinct(warnings, [`${target.id}:BRANCH_LIST_BOUNDED`]);
      }

      const aggregate = this.buildAggregate(
        context.runId,
        target,
        provider,
        recommendation,
      );
      try {
        const persisted = await this.store.recordObservation(aggregate);
        if (persisted === "inserted") createdCount += 1;
        else skippedCount += 1;
      } catch {
        targetProblem = true;
        warnings.push(`${target.id}:STORAGE_FAILURE`);
      }
      if (targetProblem) errorCount += 1;
    }

    const status =
      errorCount === 0
        ? "success"
        : createdCount + skippedCount > 0
          ? "partial"
          : "failed";
    const summary: GitHubSyncSummary = {
      id: context.runId,
      status,
      finishedAt: context.now,
      createdCount,
      updatedCount: 0,
      skippedCount,
      errorCount,
      warnings,
      rateLimitRemaining,
      rateLimitResetAt,
      processedTargets: targets.length,
    };
    await this.store.finishRun(summary);
    return summary;
  }

  private buildAggregate(
    syncRunId: string,
    target: RepositorySyncTarget,
    provider: ProviderRepositoryObservation,
    recommendation: ReturnType<typeof recommendActiveBranch>,
  ): RepositoryObservationAggregate {
    const repositoryObservationId = this.identity.nextId(
      "github-repository-observation",
    );
    const normalizedBranches = recommendation.evidence;
    const repositorySourceHash = this.identity.hash(
      JSON.stringify({
        repositoryId: target.id,
        githubNodeId: provider.githubNodeId,
        defaultBranch: provider.defaultBranch,
        providerUpdatedAt: provider.providerUpdatedAt,
        branches: normalizedBranches.map((branch) => ({
          name: branch.name,
          headSha: branch.headSha,
          committedAt: branch.committedAt,
        })),
      }),
    );
    const branches = normalizedBranches.map((branch) => ({
      id: this.identity.nextId("github-branch-observation"),
      repositoryObservationId,
      repositoryId: target.id,
      name: branch.name,
      headSha: branch.headSha,
      committedAt: branch.committedAt,
      protected: branch.protected,
      isDefault: branch.isDefault,
      observedAt: provider.observedAt,
      sourceHash: this.identity.hash(
        JSON.stringify({
          repositoryId: target.id,
          name: branch.name,
          headSha: branch.headSha,
          committedAt: branch.committedAt,
        }),
      ),
    }));
    const combinedWarnings = [
      ...new Set([
        ...provider.warnings,
        ...(provider.branchesTruncated ? ["BRANCH_LIST_BOUNDED"] : []),
        ...recommendation.warnings,
      ]),
    ];
    const recommendedBranch =
      recommendation.status === "recommended" ? recommendation.branch : null;

    return {
      repository: {
        id: repositoryObservationId,
        syncRunId,
        repositoryId: target.id,
        githubNodeId: provider.githubNodeId,
        fullName: provider.fullName,
        visibility: provider.visibility,
        defaultBranch: provider.defaultBranch,
        htmlUrl: provider.htmlUrl,
        archived: provider.archived,
        pushedAt: provider.pushedAt,
        providerUpdatedAt: provider.providerUpdatedAt,
        observedAt: provider.observedAt,
        apiVersion: provider.apiVersion,
        etag: provider.etag,
        rateLimitRemaining: provider.rateLimitRemaining,
        rateLimitResetAt: provider.rateLimitResetAt,
        branchesTruncated: provider.branchesTruncated,
        sourceHash: repositorySourceHash,
      },
      branches,
      recommendation: {
        id: this.identity.nextId("github-branch-recommendation"),
        repositoryObservationId,
        repositoryId: target.id,
        status: recommendation.status,
        branch: recommendedBranch,
        confidence: recommendation.confidence,
        reason: recommendation.reason,
        warnings: combinedWarnings,
        evidence: recommendation.evidence,
        observedAt: provider.observedAt,
        sourceHash: this.identity.hash(
          JSON.stringify({
            repositorySourceHash,
            status: recommendation.status,
            branch: recommendedBranch,
            confidence: recommendation.confidence,
          }),
        ),
      },
    };
  }
}
