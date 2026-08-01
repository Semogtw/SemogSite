import { describe, expect, it, vi } from "vitest";
import { GitHubClientError } from "./github-rest-client";
import {
  GitHubRepositoryObservationSource,
  type GitHubReadClient,
} from "./repository-observation-source";

const target = {
  id: "repository-1",
  owner: "Semogtw",
  name: "SemogSite",
  fullName: "Semogtw/SemogSite",
  defaultBranch: "main",
  currentActiveBranch: "develop/foundation-bootstrap",
};

function client(): GitHubReadClient {
  return {
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
        pushedAt: "2026-08-01T18:40:00.000Z",
        updatedAt: "2026-08-01T18:45:00.000Z",
      },
      meta: {
        etag: '"repo"',
        rateLimit: {
          limit: 5000,
          remaining: 4998,
          used: 2,
          resetAt: "2026-08-01T20:00:00.000Z",
          resource: "core",
          retryAfterSeconds: null,
        },
      },
    }),
    listBranches: vi.fn().mockResolvedValue({
      status: "ok",
      data: {
        branches: [
          { name: "main", headSha: "1111111", protected: true },
          {
            name: "develop/foundation-bootstrap",
            headSha: "2222222",
            protected: false,
          },
        ],
        truncated: false,
      },
      meta: {
        etag: '"branches"',
        rateLimit: {
          limit: 5000,
          remaining: 4997,
          used: 3,
          resetAt: "2026-08-01T20:00:00.000Z",
          resource: "core",
          retryAfterSeconds: null,
        },
      },
    }),
    getCommitObservation: vi
      .fn()
      .mockResolvedValueOnce({
        status: "ok",
        data: { sha: "1111111", committedAt: "2026-07-28T10:00:00.000Z" },
        meta: {
          etag: null,
          rateLimit: {
            limit: 5000,
            remaining: 4996,
            used: 4,
            resetAt: "2026-08-01T20:00:00.000Z",
            resource: "core",
            retryAfterSeconds: null,
          },
        },
      })
      .mockResolvedValueOnce({
        status: "ok",
        data: { sha: "2222222", committedAt: "2026-08-01T18:30:00.000Z" },
        meta: {
          etag: null,
          rateLimit: {
            limit: 5000,
            remaining: 4995,
            used: 5,
            resetAt: "2026-08-01T20:00:00.000Z",
            resource: "core",
            retryAfterSeconds: null,
          },
        },
      }),
  };
}

describe("GitHubRepositoryObservationSource", () => {
  it("collects bounded branch heads sequentially", async () => {
    const readClient = client();
    const source = new GitHubRepositoryObservationSource(readClient, () =>
      Promise.resolve("2026-08-01T19:00:00.000Z"),
    );

    const result = await source.observe(target, 25);

    expect(result).toMatchObject({
      ok: true,
      observation: {
        fullName: "Semogtw/SemogSite",
        apiVersion: "2026-03-10",
        partial: false,
        rateLimitRemaining: 4995,
        branches: [
          { name: "main", headSha: "1111111" },
          { name: "develop/foundation-bootstrap", headSha: "2222222" },
        ],
      },
    });
    expect(readClient.listBranches).toHaveBeenCalledWith("Semogtw", "SemogSite", 25);
    expect(readClient.getCommitObservation).toHaveBeenNthCalledWith(
      1,
      "Semogtw",
      "SemogSite",
      "1111111",
    );
  });

  it("keeps useful evidence and marks partial when one commit lookup fails", async () => {
    const readClient = client();
    vi.mocked(readClient.getCommitObservation)
      .mockReset()
      .mockResolvedValueOnce({
        status: "ok",
        data: { sha: "1111111", committedAt: "2026-07-28T10:00:00.000Z" },
        meta: {
          etag: null,
          rateLimit: {
            limit: 5000,
            remaining: 4996,
            used: 4,
            resetAt: "2026-08-01T20:00:00.000Z",
            resource: "core",
            retryAfterSeconds: null,
          },
        },
      })
      .mockRejectedValueOnce(
        new GitHubClientError({
          code: "RATE_LIMITED",
          status: 429,
          rateLimitResetAt: "2026-08-01T20:00:00.000Z",
        }),
      );
    const source = new GitHubRepositoryObservationSource(readClient, () =>
      Promise.resolve("2026-08-01T19:00:00.000Z"),
    );

    const result = await source.observe(target, 25);

    expect(result).toMatchObject({
      ok: true,
      observation: {
        partial: true,
        rateLimitResetAt: "2026-08-01T20:00:00.000Z",
        branches: [{ name: "main" }],
        warnings: [
          "BRANCH_COMMIT_FAILED:develop/foundation-bootstrap:RATE_LIMITED",
        ],
      },
    });
  });

  it("maps repository-level provider errors to a failed observation", async () => {
    const readClient = client();
    vi.mocked(readClient.getRepository).mockRejectedValue(
      new GitHubClientError({ code: "NOT_FOUND", status: 404 }),
    );
    const source = new GitHubRepositoryObservationSource(readClient, () =>
      Promise.resolve("2026-08-01T19:00:00.000Z"),
    );

    await expect(source.observe(target, 25)).resolves.toEqual({
      ok: false,
      failure: { code: "NOT_FOUND", retryAt: null },
    });
  });
});
