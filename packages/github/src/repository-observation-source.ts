import type {
  BranchObservation,
  GitHubObservationSource,
  RepositoryObservationFailure,
  RepositoryObservationResult,
  RepositorySyncTarget,
} from "@semogtw/domain";
import {
  GITHUB_API_VERSION,
  GitHubClientError,
  type GitHubBranchPage,
  type GitHubCommitObservation,
  type GitHubRepository,
  type GitHubResult,
} from "./github-rest-client";

export interface GitHubReadClient {
  getRepository(
    owner: string,
    repository: string,
  ): Promise<GitHubResult<GitHubRepository>>;
  listBranches(
    owner: string,
    repository: string,
    maxBranches: number,
  ): Promise<GitHubResult<GitHubBranchPage>>;
  getCommitObservation(
    owner: string,
    repository: string,
    ref: string,
  ): Promise<GitHubResult<GitHubCommitObservation>>;
}

export type ObservationClock = () => string | Promise<string>;

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/u;
const repositoryPattern = /^[A-Za-z0-9._-]{1,100}$/u;
const branchPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const headShaPattern = /^[0-9a-f]{7,64}$/u;

function isSafeBranchName(name: string): boolean {
  return (
    branchPattern.test(name) &&
    !/[~^:?*[\\]/u.test(name) &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.startsWith(".") &&
    !name.endsWith(".") &&
    !name.endsWith(".lock") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.includes("//")
  );
}

function lowerRemaining(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function laterReset(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  const leftEpoch = Date.parse(left);
  const rightEpoch = Date.parse(right);
  if (Number.isNaN(rightEpoch)) return left;
  if (Number.isNaN(leftEpoch)) return right;
  return rightEpoch > leftEpoch ? right : left;
}

function mapFailure(
  error: unknown,
  observedAt: string,
): RepositoryObservationFailure {
  if (!(error instanceof GitHubClientError)) {
    return { code: "UNKNOWN_FAILURE", retryAt: null };
  }
  const supportedCodes = new Set<RepositoryObservationFailure["code"]>([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "RATE_LIMITED",
    "INVALID_RESPONSE",
    "TRANSPORT_FAILURE",
  ]);
  const code = supportedCodes.has(
    error.code as RepositoryObservationFailure["code"],
  )
    ? (error.code as RepositoryObservationFailure["code"])
    : "INVALID_RESPONSE";
  const retryAt =
    error.rateLimitResetAt ??
    (error.retryAfterSeconds === undefined
      ? null
      : new Date(
          Date.parse(observedAt) + error.retryAfterSeconds * 1_000,
        ).toISOString());
  return { code, retryAt };
}

function normalizedClockValue(value: string): string {
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) throw new Error("INVALID_CLOCK");
  return new Date(epoch).toISOString();
}

function hasSafeRepositoryMetadata(
  repository: GitHubRepository,
  target: RepositorySyncTarget,
): boolean {
  if (!ownerPattern.test(repository.owner)) return false;
  if (!repositoryPattern.test(repository.name)) return false;
  if (repository.name === "." || repository.name === "..") return false;
  if (repository.fullName !== `${repository.owner}/${repository.name}`) {
    return false;
  }
  const requestedIdentity = `${target.owner.trim()}/${target.name.trim()}`;
  if (repository.fullName.toLowerCase() !== requestedIdentity.toLowerCase()) {
    return false;
  }
  if (!isSafeBranchName(repository.defaultBranch)) return false;
  if (repository.nodeId.length === 0 || repository.nodeId.length > 500) {
    return false;
  }

  try {
    const url = new URL(repository.htmlUrl);
    const expectedPath = `/${repository.owner}/${repository.name}`.toLowerCase();
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.pathname.replace(/\/$/u, "").toLowerCase().endsWith(expectedPath)
    );
  } catch {
    return false;
  }
}

export class GitHubRepositoryObservationSource
  implements GitHubObservationSource
{
  constructor(
    private readonly client: GitHubReadClient,
    private readonly clock: ObservationClock = () => new Date().toISOString(),
  ) {}

  async observe(
    target: RepositorySyncTarget,
    maxBranches: number,
  ): Promise<RepositoryObservationResult> {
    let observedAt: string;
    try {
      observedAt = normalizedClockValue(await this.clock());
    } catch {
      return {
        ok: false,
        failure: { code: "UNKNOWN_FAILURE", retryAt: null },
      };
    }

    let repositoryResult: GitHubResult<GitHubRepository>;
    try {
      repositoryResult = await this.client.getRepository(
        target.owner,
        target.name,
      );
    } catch (error) {
      return { ok: false, failure: mapFailure(error, observedAt) };
    }
    if (
      repositoryResult.status !== "ok" ||
      !hasSafeRepositoryMetadata(repositoryResult.data, target)
    ) {
      return {
        ok: false,
        failure: { code: "INVALID_RESPONSE", retryAt: null },
      };
    }

    let branchResult: GitHubResult<GitHubBranchPage>;
    try {
      branchResult = await this.client.listBranches(
        target.owner,
        target.name,
        maxBranches,
      );
    } catch (error) {
      return { ok: false, failure: mapFailure(error, observedAt) };
    }
    if (branchResult.status !== "ok") {
      return {
        ok: false,
        failure: { code: "INVALID_RESPONSE", retryAt: null },
      };
    }

    let rateLimitRemaining = lowerRemaining(
      repositoryResult.meta.rateLimit.remaining,
      branchResult.meta.rateLimit.remaining,
    );
    let rateLimitResetAt = laterReset(
      repositoryResult.meta.rateLimit.resetAt,
      branchResult.meta.rateLimit.resetAt,
    );
    const warnings: string[] = [];
    const branches: BranchObservation[] = [];
    let partial = false;

    for (const branch of branchResult.data.branches) {
      const branchName = branch.name.trim();
      const headSha = branch.headSha.trim().toLowerCase();
      if (!isSafeBranchName(branchName)) {
        partial = true;
        warnings.push(
          branchName.length === 0
            ? "INVALID_BRANCH_NAME"
            : `INVALID_BRANCH_NAME:${branchName}`,
        );
        continue;
      }
      if (!headShaPattern.test(headSha)) {
        partial = true;
        warnings.push(`INVALID_HEAD_SHA:${branchName}`);
        continue;
      }

      try {
        const commitResult = await this.client.getCommitObservation(
          target.owner,
          target.name,
          headSha,
        );
        if (commitResult.status !== "ok") {
          partial = true;
          warnings.push(`BRANCH_COMMIT_NOT_MODIFIED:${branchName}`);
          continue;
        }
        rateLimitRemaining = lowerRemaining(
          rateLimitRemaining,
          commitResult.meta.rateLimit.remaining,
        );
        rateLimitResetAt = laterReset(
          rateLimitResetAt,
          commitResult.meta.rateLimit.resetAt,
        );
        if (commitResult.data.sha !== headSha) {
          partial = true;
          warnings.push(`BRANCH_HEAD_MISMATCH:${branchName}`);
          continue;
        }
        branches.push({
          name: branchName,
          headSha,
          committedAt: commitResult.data.committedAt,
          protected: branch.protected,
        });
      } catch (error) {
        const failure = mapFailure(error, observedAt);
        partial = true;
        warnings.push(`BRANCH_COMMIT_FAILED:${branchName}:${failure.code}`);
        rateLimitResetAt = laterReset(rateLimitResetAt, failure.retryAt);
        if (failure.code === "RATE_LIMITED") break;
      }
    }

    if (
      branchResult.data.branches.length > 0 &&
      branches.length < branchResult.data.branches.length
    ) {
      partial = true;
    }

    return {
      ok: true,
      observation: {
        githubNodeId: repositoryResult.data.nodeId,
        fullName: repositoryResult.data.fullName,
        visibility: repositoryResult.data.visibility,
        defaultBranch: repositoryResult.data.defaultBranch,
        htmlUrl: repositoryResult.data.htmlUrl,
        archived: repositoryResult.data.archived,
        pushedAt: repositoryResult.data.pushedAt,
        providerUpdatedAt: repositoryResult.data.updatedAt,
        observedAt,
        apiVersion: GITHUB_API_VERSION,
        etag: repositoryResult.meta.etag,
        rateLimitRemaining,
        rateLimitResetAt,
        branchesTruncated: branchResult.data.truncated,
        branches,
        warnings,
        partial,
      },
    };
  }
}
