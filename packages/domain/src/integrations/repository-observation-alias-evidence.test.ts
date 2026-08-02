import { describe, expect, it } from "vitest";
import { recommendActiveBranch } from "./repository-observation";

describe("repository recommendation alias evidence", () => {
  it("keeps every normalized alias even when the default branch is selected", () => {
    const result = recommendActiveBranch({
      defaultBranch: "main",
      currentActiveBranch: "release",
      observedAt: "2026-08-02T00:30:00.000Z",
      branches: [
        {
          name: "main",
          headSha: "abcdef1",
          committedAt: "2026-08-02T00:00:00.000Z",
          protected: true,
        },
        {
          name: "release",
          headSha: "abcdef1",
          committedAt: "2026-08-02T00:00:00.000Z",
          protected: false,
        },
      ],
    });

    expect(result).toMatchObject({
      status: "recommended",
      branch: "main",
      confidence: "low",
    });
    expect(result.evidence.map((item) => item.name)).toEqual([
      "main",
      "release",
    ]);
  });
});
