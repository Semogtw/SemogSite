import { describe, expect, it, vi } from "vitest";
import { GitHubClientError } from "./github-rest-client";
import {
  GitHubRepositoryObservationSource,
  type GitHubReadClient,
} from "./repository-observation-source";

const meta = {
  etag: null,
  rateLimit: {
    limit: 5000,
    remaining: 4990,
    used: 10,
    resetAt: "2026-08-01T22:00:00.000Z",
    resource: "core",
    retryAfterSeconds: null,
  },
};

describe("GitHubRepositoryObservationSource rate limits", () => {
  it("does not request later branch commits after a rate limit", async () => {
    const getCommitObservation = vi
      .fn<GitHubReadClient["getCommitObservation"]>()
      .mockResolvedValueOnce({
        status: "ok",
        data: {
          sha: "1111111",
          committedAt: "2026-08-01T18:00:00.000Z",
        },
        meta,
      })
      .mockRejectedValueOnce(
        new GitHubClientError({
          code: "RATE_LIMITED",
          status: 429,
          rateLimitResetAt: "2026-08-01T22:00:00.000Z",
        }),
      );
    const client: GitHubReadClient = {
      getRepository: vi.fn().mockResolvedValue({
        status: "ok",
        data: {
          nodeId: "R_repo",
          owner: "Semogtw",
          name: "SemogSite",
          fullName: "Semogtw/SemogSite",
          visibility: "private",
          htmlUrl: "https://github.com/Semogtw/SemogSite",
          defaultBranch: "main",
          archived: false,
          pushedAt: "2026-08-01T18:30:00.000Z",
          updatedAt: "2026-08-01T18:35:00.000Z",
        },
        meta,
      }),
      listBranches: vi.fn().mockResolvedValue({
        status: "ok",
        data: {
          branches: [
            { name: "main", headSha: "1111111", protected: true },
            { name: "develop", headSha: "2222222", protected: false },
            { name: "later", headSha: "3333333", protected: false },
          ],
          truncated: false,
        },
        meta,
      }),
      getCommitObservation,
    };
    const source = new GitHubRepositoryObservationSource(client, () =>
      Promise.resolve("2026-08-01T21:00:00.000Z"),
    );

    const result = await source.observe(
      {
        id: "repository-1",
        owner: "Semogtw",
        name: "SemogSite",
        fullName: "Semogtw/SemogSite",
        defaultBranch: "main",
        currentActiveBranch: "main",
      },
      25,
    );

    expect(result).toMatchObject({
      ok: true,
      observation: {
        partial: true,
        rateLimitResetAt: "2026-08-01T22:00:00.000Z",
        branches: [{ name: "main" }],
        warnings: ["BRANCH_COMMIT_FAILED:develop:RATE_LIMITED"],
      },
    });
    expect(getCommitObservation).toHaveBeenCalledTimes(2);
    expect(getCommitObservation).not.toHaveBeenCalledWith(
      "Semogtw",
      "SemogSite",
      "3333333",
    );
  });
});
