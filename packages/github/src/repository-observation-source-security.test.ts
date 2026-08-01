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

function repositoryResult(input: {
  fullName?: string;
  htmlUrl?: string;
  defaultBranch?: string;
}) {
  return {
    status: "ok" as const,
    data: {
      nodeId: "R_repo",
      owner: "Semogtw",
      name: "SemogSite",
      fullName: input.fullName ?? "Semogtw/SemogSite",
      visibility: "private" as const,
      htmlUrl: input.htmlUrl ?? "https://github.com/Semogtw/SemogSite",
      defaultBranch: input.defaultBranch ?? "main",
      archived: false,
      pushedAt: "2026-08-01T18:40:00.000Z",
      updatedAt: "2026-08-01T18:45:00.000Z",
    },
    meta: {
      etag: null,
      rateLimit: {
        limit: 5000,
        remaining: 4999,
        used: 1,
        resetAt: null,
        resource: "core",
        retryAfterSeconds: null,
      },
    },
  };
}

function readClient(repository: ReturnType<typeof repositoryResult>): GitHubReadClient {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listBranches: vi.fn(),
    getCommitObservation: vi.fn(),
  };
}

describe("GitHubRepositoryObservationSource provider validation", () => {
  it.each([
    repositoryResult({ fullName: "Semogtw" }),
    repositoryResult({ fullName: "Semogtw/SemogSite/extra" }),
    repositoryResult({ fullName: " Semogtw/SemogSite " }),
    repositoryResult({ htmlUrl: "http://github.com/Semogtw/SemogSite" }),
    repositoryResult({
      htmlUrl: "https://user:secret@github.com/Semogtw/SemogSite",
    }),
    repositoryResult({ defaultBranch: " " }),
  ])("rejects malformed repository metadata before branch reads", async (value) => {
    const client = readClient(value);
    const source = new GitHubRepositoryObservationSource(client, () =>
      Promise.resolve("2026-08-01T19:00:00.000Z"),
    );

    await expect(source.observe(target, 25)).resolves.toEqual({
      ok: false,
      failure: { code: "INVALID_RESPONSE", retryAt: null },
    });
    expect(client.listBranches).not.toHaveBeenCalled();
  });
});
