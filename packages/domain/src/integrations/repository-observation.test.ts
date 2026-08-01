import { describe, expect, it } from "vitest";
import { recommendActiveBranch, type BranchObservation } from "./repository-observation";

const now = "2026-08-01T18:00:00.000Z";
const branch = (
  name: string,
  headSha: string,
  committedAt: string,
  protectedBranch = false,
): BranchObservation => ({ name, headSha, committedAt, protected: protectedBranch });

describe("recommendActiveBranch", () => {
  it("returns unavailable without valid branch evidence", () => {
    expect(
      recommendActiveBranch({
        defaultBranch: "main",
        currentActiveBranch: null,
        branches: [],
        observedAt: now,
      }),
    ).toMatchObject({ status: "unavailable", confidence: "low", evidence: [] });
  });

  it("prefers the default branch when aliases share the newest head", () => {
    const result = recommendActiveBranch({
      defaultBranch: "main",
      currentActiveBranch: "release",
      branches: [
        branch("feature/alias", "ABCDEF1", "2026-08-01T16:00:00.000Z"),
        branch("main", "abcdef1", "2026-08-01T16:00:00.000Z", true),
        branch("release", "abcdef1", "2026-08-01T16:00:00.000Z"),
      ],
      observedAt: now,
    });

    expect(result).toMatchObject({
      status: "recommended",
      branch: "main",
      confidence: "low",
    });
  });

  it("recommends a clearly newer unique branch", () => {
    const result = recommendActiveBranch({
      defaultBranch: "main",
      currentActiveBranch: "main",
      branches: [
        branch("main", "1111111", "2026-07-28T10:00:00.000Z", true),
        branch("develop/foundation-bootstrap", "2222222", "2026-08-01T17:30:00.000Z"),
        branch("experiment", "3333333", "2026-07-20T08:00:00.000Z"),
      ],
      observedAt: now,
    });

    expect(result).toMatchObject({
      status: "recommended",
      branch: "develop/foundation-bootstrap",
      confidence: "high",
    });
    expect(result.evidence.map((item) => item.name)).toEqual([
      "develop/foundation-bootstrap",
      "main",
      "experiment",
    ]);
  });

  it("keeps the active branch inside the stability window", () => {
    const result = recommendActiveBranch({
      defaultBranch: "main",
      currentActiveBranch: "develop",
      branches: [
        branch("main", "1111111", "2026-08-01T17:00:00.000Z"),
        branch("develop", "2222222", "2026-08-01T16:00:00.000Z"),
      ],
      observedAt: now,
      stabilityWindowHours: 72,
    });

    expect(result).toMatchObject({
      status: "recommended",
      branch: "develop",
      confidence: "medium",
    });
  });
});
