import { describe, expect, it } from "vitest";
import {
  RepositoryTargetRegistrationService,
  type RepositorySyncTargetRegistrationAuditEvent,
  type RepositorySyncTargetRegistrationRepository,
  type RegisteredRepositorySyncTarget,
} from "./repository-target-registration-service";

const context = {
  actorId: "semogtw-owner",
  repositoryId: "repository-new",
  auditId: "audit-repository-new",
  correlationId: "correlation-repository-new",
  now: "2026-08-01T21:00:00.000Z",
};

class RecordingRepository
  implements RepositorySyncTargetRegistrationRepository
{
  calls: Array<{
    target: RegisteredRepositorySyncTarget;
    audit: RepositorySyncTargetRegistrationAuditEvent;
  }> = [];

  constructor(
    private readonly result:
      | "created"
      | "project_not_found"
      | "duplicate"
      | "conflict" = "created",
  ) {}

  async createWithAudit(
    target: RegisteredRepositorySyncTarget,
    audit: RepositorySyncTargetRegistrationAuditEvent,
  ): Promise<"created" | "project_not_found" | "duplicate" | "conflict"> {
    this.calls.push({ target, audit });
    return this.result;
  }
}

describe("RepositoryTargetRegistrationService", () => {
  it("registers a conservative private GitHub synchronization target", async () => {
    const repository = new RecordingRepository();
    const service = new RepositoryTargetRegistrationService(repository);

    const result = await service.register(
      {
        projectId: " project-platform ",
        fullName: " Semogtw/SemogSite ",
        defaultBranch: " main ",
        role: "primary",
        reason: "Este repositório é a fonte técnica principal do projeto.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      target: {
        id: context.repositoryId,
        projectId: "project-platform",
        githubNodeId: null,
        owner: "Semogtw",
        name: "SemogSite",
        fullName: "Semogtw/SemogSite",
        htmlUrl: "https://github.com/Semogtw/SemogSite",
        visibility: "private",
        defaultBranch: "main",
        activeBranch: null,
        role: "primary",
        syncEnabled: true,
        status: "active",
        lastSyncedAt: null,
        dataSource: "manual",
        createdAt: context.now,
        updatedAt: context.now,
      },
      audit: {
        id: context.auditId,
        actor: context.actorId,
        action: "repository.sync_target.create",
        entityType: "repository",
        entityId: context.repositoryId,
        before: null,
        after: expect.any(Object),
        reason: "Este repositório é a fonte técnica principal do projeto.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: context.correlationId,
      },
    });
    expect(repository.calls).toEqual(
      result.ok
        ? [{ target: result.target, audit: result.audit }]
        : expect.unreachable(),
    );
  });

  it("rejects malformed identity, unsafe branch and missing confirmation", async () => {
    const repository = new RecordingRepository();
    const service = new RepositoryTargetRegistrationService(repository);

    await expect(
      service.register(
        {
          projectId: " ",
          fullName: "user:secret@example.com/repo/extra",
          defaultBranch: "feature branch",
          role: "archive" as "primary",
          reason: " ",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "CONFIRMATION_REQUIRED",
        "PROJECT_ID_REQUIRED",
        "FULL_NAME_INVALID",
        "DEFAULT_BRANCH_INVALID",
        "ROLE_INVALID",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it.each([
    ["project_not_found", "PROJECT_NOT_FOUND"],
    ["duplicate", "DUPLICATE_REPOSITORY"],
    ["conflict", "CONFLICT"],
  ] as const)("maps repository result %s without claiming success", async (stored, code) => {
    const repository = new RecordingRepository(stored);
    const service = new RepositoryTargetRegistrationService(repository);

    await expect(
      service.register(
        {
          projectId: "project-platform",
          fullName: "Semogtw/SemogSite",
          defaultBranch: "main",
          role: "secondary",
          reason: "Adicionar alvo secundário.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code });
  });
});
