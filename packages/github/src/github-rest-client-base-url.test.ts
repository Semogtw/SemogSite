import { describe, expect, it, vi } from "vitest";
import { GitHubRestClient } from "./github-rest-client";

describe("GitHubRestClient base URL policy", () => {
  it.each([
    "http://api.github.com",
    "https://user:secret@api.github.com",
    "https://api.github.com?token=leak",
    "https://api.github.com#fragment",
  ])("rejects unsafe base URL %s before any request", async (baseUrl) => {
    const fetcher = vi.fn<typeof fetch>();

    expect(
      () => new GitHubRestClient({ token: "secret-token", baseUrl, fetcher }),
    ).toThrow("INVALID_GITHUB_BASE_URL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes a credential-free HTTPS enterprise API path", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          node_id: "R_repo",
          name: "SemogSite",
          full_name: "Semogtw/SemogSite",
          private: true,
          html_url: "https://github.example.com/Semogtw/SemogSite",
          default_branch: "main",
          archived: false,
          pushed_at: null,
          updated_at: "2026-08-01T23:50:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new GitHubRestClient({
      baseUrl: "https://github.example.com/api/v3/",
      fetcher,
    });

    await client.getRepository("Semogtw", "SemogSite");

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://github.example.com/api/v3/repos/Semogtw/SemogSite",
    );
  });
});
