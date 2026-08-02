import { describe, expect, it } from "vitest";
import {
  RepositoryTargetRegistrationService,
  type RepositorySyncTargetRegistrationRepository,
  type RepositorySyncTargetRegistrationStoreResult,
} from "./repository-target-registration-service";

class UnexpectedRepository
  implements RepositorySyncTargetRegistrationRepository
{
  async createWithAudit(): Promise<RepositorySyncTargetRegistrationStoreResult> {
    throw new Error("PERSISTENCE_SHOULD_NOT_BE_CALLED");
  }
}

const context = {
  actorId: "semogtw-owner",
  repositoryId: "repository-new",
  auditId: "audit-new",
  correlationId: "correlation-new",
  now: "2026-08-01T23:45:00.000Z",
};

describe("RepositoryTargetRegistrationService default branch policy", () => {
  it.each([
    "feature branch",
    "bad..branch",
    ".hidden",
    "main.",
    "main.lock",
    "refs//heads/main",
    "branch@{1}",
    "feature~1",
    "feature^2",
    "feature:child",
    "feature?child",
    "feature*child",
    "feature[child",
    "feature\\child",
  ])("rejects unsafe branch %s before persistence", async (defaultBranch) => {
    const service = new RepositoryTargetRegistrationService(
      new UnexpectedRepository(),
    );

    await expect(
      service.register(
        {
          projectId: "demo-project-platform",
          fullName: "Semogtw/SemogSite",
          defaultBranch,
          role: "product",
          reason: "Cadastrar fonte principal.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["DEFAULT_BRANCH_INVALID"],
    });
  });
});
