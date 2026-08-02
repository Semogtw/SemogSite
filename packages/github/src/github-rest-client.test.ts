import { describe, expect, it, vi } from "vitest";
import { GitHubClientError, GitHubRestClient } from "./github-rest-client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

describe("GitHubRestClient", () => {
  it("reads repository metadata with versioned read-only headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          node_id: "R_repo",
          name: "SemogSite",
          full_name: "Semogtw/SemogSite",
          private: true,
          html_url: "https://github.com/Semogtw/SemogSite",
          default_branch: "main",
          archived: false,
          pushed_at: "2026-08-01T17:00:00Z",
          updated_at: "2026-08-01T17:05:00Z",
        },
        {
          headers: {
            etag: '"repo-etag"',
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-used": "1",
            "x-ratelimit-reset": "1785610800",
            "x-ratelimit-resource": "core",
          },
        },
      ),
    );
    const client = new GitHubRestClient({ token: "secret-token", fetcher });

    const result = await client.getRepository("Semogtw", "SemogSite");

    expect(result).toMatchObject({
      status: "ok",
      data: {
        nodeId: "R_repo",
        fullName: "Semogtw/SemogSite",
        visibility: "private",
        defaultBranch: "main",
      },
      meta: {
        etag: '"repo-etag"',
        rateLimit: { limit: 5000, remaining: 4999, used: 1, resource: "core" },
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/Semogtw/SemogSite",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
          Authorization: "Bearer secret-token",
          "User-Agent": "Semogtw-DevOS",
          "X-GitHub-Api-Version": "2026-03-10",
        }),
      }),
    );
  });

  it("encodes branch refs and maps commit dates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        sha: "ABCDEF123",
        commit: {
          author: { date: "2026-08-01T16:00:00Z" },
          committer: { date: "2026-08-01T16:30:00Z" },
        },
      }),
    );
    const client = new GitHubRestClient({ fetcher });

    const result = await client.getCommitObservation(
      "Semogtw",
      "SemogSite",
      "develop/foundation bootstrap",
    );

    expect(result).toMatchObject({
      status: "ok",
      data: { sha: "abcdef123", committedAt: "2026-08-01T16:30:00.000Z" },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/Semogtw/SemogSite/commits/develop%2Ffoundation%20bootstrap",
    );
  });

  it("bounds branch reads and validates the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        { name: "main", commit: { sha: "1111111" }, protected: true },
        { name: "develop", commit: { sha: "2222222" }, protected: false },
      ]),
    );
    const client = new GitHubRestClient({ fetcher });

    const result = await client.listBranches("Semogtw", "SemogSite", 2);

    expect(result).toMatchObject({
      status: "ok",
      data: {
        branches: [
          { name: "main", headSha: "1111111", protected: true },
          { name: "develop", headSha: "2222222", protected: false },
        ],
        truncated: true,
      },
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain("per_page=2");
    await expect(client.listBranches("Semogtw", "SemogSite", 101)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("returns not-modified for a conditional request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 304, headers: { etag: '"same"' } }),
    );
    const client = new GitHubRestClient({ fetcher });

    await expect(
      client.getRepository("Semogtw", "SemogSite", { etag: '"same"' }),
    ).resolves.toMatchObject({ status: "not_modified", meta: { etag: '"same"' } });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ "If-None-Match": '"same"' }) }),
    );
  });

  it("maps rate limits without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { message: "API rate limit exceeded" },
        {
          status: 429,
          headers: {
            "retry-after": "120",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1785610800",
          },
        },
      ),
    );
    const client = new GitHubRestClient({ fetcher });

    await expect(client.getRepository("Semogtw", "SemogSite")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 120,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed provider responses and transport failures", async () => {
    const malformed = new GitHubRestClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: "partial" })),
    });
    await expect(malformed.getRepository("Semogtw", "SemogSite")).rejects.toBeInstanceOf(
      GitHubClientError,
    );
    await expect(malformed.getRepository("Semogtw", "SemogSite")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    const transport = new GitHubRestClient({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")),
    });
    await expect(transport.getRepository("Semogtw", "SemogSite")).rejects.toMatchObject({
      code: "TRANSPORT_FAILURE",
    });
  });
});
