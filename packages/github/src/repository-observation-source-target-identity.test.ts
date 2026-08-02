import { describe, expect, it, vi } from "vitest";
import type { GitHubReadClient } from "./repository-observation-source";
import { GitHubRepositoryObservationSource } from "./repository-observation-source";

const target = {
  id: "repository-1",
  owner: "Semogtw",
  name: "SemogSite",
  fullName: "Semogtw/SemogSite",
  defaultBranch: "main",
  currentActiveBranch: "main",
};

const meta = {
  etag: null,
  rateLimit: {
    limit: 5000,
    remaining: 4999,
    used: 1,
    resetAt: null,
    resource: "core",
    retryAfterSeconds: null,
  },
};

describe("GitHubRepositoryObservationSource target identity", () => {
  it("rejects a valid but different repository before branch reads", async () => {
    const listBranches = vi.fn();
    const client: GitHubReadClient = {
      getRepository: vi.fn().mockResolvedValue({
        status: "ok",
        data: {
          nodeId: "R_other",
          owner: "AnotherOwner",
          name: "AnotherRepo",
          fullName: "AnotherOwner/AnotherRepo",
          visibility: "private",
          htmlUrl: "https://github.com/AnotherOwner/AnotherRepo",
          defaultBranch: "main",
          archived: false,
          pushedAt: null,
          updatedAt: "2026-08-02T00:40:00.000Z",
        },
        meta,
      }),
      listBranches,
      getCommitObservation: vi.fn(),
    };
    const source = new GitHubRepositoryObservationSource(client, () =>
      Promise.resolve("2026-08-02T00:45:00.000Z"),
    );

    await expect(source.observe(target, 25)).resolves.toEqual({
      ok: false,
      failure: { code: "INVALID_RESPONSE", retryAt: null },
    });
    expect(listBranches).not.toHaveBeenCalled();
  });

  it("accepts case-only canonicalization of the requested identity", async () => {
    const client: GitHubReadClient = {
      getRepository: vi.fn().mockResolvedValue({
        status: "ok",
        data: {
          nodeId: "R_repo",
          owner: "semogtw",
          name: "semogsite",
          fullName: "semogtw/semogsite",
          visibility: "private",
          htmlUrl: "https://github.com/semogtw/semogsite",
          defaultBranch: "main",
          archived: false,
          pushedAt: null,
          updatedAt: "2026-08-02T00:40:00.000Z",
        },
        meta,
      }),
      listBranches: vi.fn().mockResolvedValue({
        status: "ok",
        data: { branches: [], truncated: false },
        meta,
      }),
      getCommitObservation: vi.fn(),
    };
    const source = new GitHubRepositoryObservationSource(client, () =>
      Promise.resolve("2026-08-02T00:45:00.000Z"),
    );

    await expect(source.observe(target, 25)).resolves.toMatchObject({
      ok: true,
      observation: { fullName: "semogtw/semogsite" },
    });
  });
});
