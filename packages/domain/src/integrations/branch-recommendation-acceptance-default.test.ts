import { describe, expect, it } from "vitest";
import {
  BranchRecommendationAcceptanceService,
  type BranchRecommendationAcceptanceRepository,
  type RepositoryBranchCandidate,
} from "./branch-recommendation-acceptance-service";

const candidate: RepositoryBranchCandidate = {
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    activeBranch: null,
    defaultBranch: "main",
    updatedAt: "2026-08-01T20:00:00.000Z",
  },
  recommendation: {
    id: "recommendation-main",
    status: "recommended",
    branch: "main",
    confidence: "medium",
    observedAt: "2026-08-01T20:10:00.000Z",
  },
};

describe("BranchRecommendationAcceptanceService effective active branch", () => {
  it("rejects a recommendation equal to the fallback default branch", async () => {
    let writes = 0;
    const repository: BranchRecommendationAcceptanceRepository = {
      findCandidate: async () => candidate,
      acceptWithAudit: async () => {
        writes += 1;
        return true;
      },
    };
    const service = new BranchRecommendationAcceptanceService(repository);

    await expect(
      service.accept(
        {
          repositoryId: "repository-1",
          recommendationId: "recommendation-main",
          expectedActiveBranch: null,
          reason: "A default já representa o estado efetivo.",
          confirmed: true,
        },
        {
          actorId: "semogtw-owner",
          auditId: "audit-default",
          correlationId: "correlation-default",
          now: "2026-08-01T20:30:00.000Z",
        },
      ),
    ).resolves.toEqual({ ok: false, code: "ALREADY_ACTIVE" });
    expect(writes).toBe(0);
  });
});
