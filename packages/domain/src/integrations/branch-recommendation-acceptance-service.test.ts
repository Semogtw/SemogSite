import { describe, expect, it } from "vitest";
import {
  BranchRecommendationAcceptanceService,
  type BranchRecommendationAcceptanceAuditEvent,
  type BranchRecommendationAcceptanceRepository,
  type RepositoryBranchCandidate,
} from "./branch-recommendation-acceptance-service";

const candidate: RepositoryBranchCandidate = {
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    activeBranch: "main",
    defaultBranch: "main",
    updatedAt: "2026-08-01T19:00:00.000Z",
  },
  recommendation: {
    id: "recommendation-1",
    status: "recommended",
    branch: "develop/foundation-bootstrap",
    confidence: "high",
    observedAt: "2026-08-01T19:30:00.000Z",
  },
};

const context = {
  actorId: "semogtw-owner",
  auditId: "audit-branch-1",
  correlationId: "correlation-branch-1",
  now: "2026-08-01T20:30:00.000Z",
};

class RecordingRepository
  implements BranchRecommendationAcceptanceRepository
{
  calls: Array<{
    before: RepositoryBranchCandidate;
    after: RepositoryBranchCandidate;
    audit: BranchRecommendationAcceptanceAuditEvent;
  }> = [];

  constructor(
    private readonly value: RepositoryBranchCandidate | null = candidate,
    private readonly transitioned = true,
  ) {}

  async findCandidate(): Promise<RepositoryBranchCandidate | null> {
    return this.value;
  }

  async acceptWithAudit(
    before: RepositoryBranchCandidate,
    after: RepositoryBranchCandidate,
    audit: BranchRecommendationAcceptanceAuditEvent,
  ): Promise<boolean> {
    this.calls.push({ before, after, audit });
    return this.transitioned;
  }
}

describe("BranchRecommendationAcceptanceService", () => {
  it("accepts the latest recommendation and records the manual decision", async () => {
    const repository = new RecordingRepository();
    const service = new BranchRecommendationAcceptanceService(repository);

    const result = await service.accept(
      {
        repositoryId: candidate.repository.id,
        recommendationId: candidate.recommendation!.id,
        expectedActiveBranch: "main",
        reason: "Esta é a linha de desenvolvimento validada para continuidade.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      candidate: {
        ...candidate,
        repository: {
          ...candidate.repository,
          activeBranch: "develop/foundation-bootstrap",
          updatedAt: context.now,
        },
      },
      audit: {
        id: context.auditId,
        actor: context.actorId,
        action: "repository.active_branch.accept",
        entityType: "repository",
        entityId: candidate.repository.id,
        before: candidate,
        after: expect.any(Object),
        reason: "Esta é a linha de desenvolvimento validada para continuidade.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: context.correlationId,
      },
    });
    expect(repository.calls).toEqual(
      result.ok
        ? [{ before: candidate, after: result.candidate, audit: result.audit }]
        : expect.unreachable(),
    );
  });

  it("rejects a recommendation that is no longer latest", async () => {
    const repository = new RecordingRepository();
    const service = new BranchRecommendationAcceptanceService(repository);

    await expect(
      service.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: "recommendation-old",
          expectedActiveBranch: "main",
          reason: "Aceitar recomendação antiga.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_RECOMMENDATION" });
    expect(repository.calls).toHaveLength(0);
  });

  it("rejects stale active-branch state and a no-op", async () => {
    const repository = new RecordingRepository();
    const service = new BranchRecommendationAcceptanceService(repository);

    await expect(
      service.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: candidate.recommendation!.id,
          expectedActiveBranch: "release",
          reason: "A interface observou outro estado.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "STALE_ACTIVE_BRANCH" });

    const alreadyActive = new BranchRecommendationAcceptanceService(
      new RecordingRepository({
        ...candidate,
        repository: {
          ...candidate.repository,
          activeBranch: "develop/foundation-bootstrap",
        },
      }),
    );
    await expect(
      alreadyActive.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: candidate.recommendation!.id,
          expectedActiveBranch: "develop/foundation-bootstrap",
          reason: "Já aplicada.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "ALREADY_ACTIVE" });
  });

  it("rejects missing and unavailable recommendations", async () => {
    const missingRepository = new BranchRecommendationAcceptanceService(
      new RecordingRepository(null),
    );
    await expect(
      missingRepository.accept(
        {
          repositoryId: "missing",
          recommendationId: "recommendation-1",
          expectedActiveBranch: null,
          reason: "Registro ausente.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "REPOSITORY_NOT_FOUND" });

    const noRecommendation = new BranchRecommendationAcceptanceService(
      new RecordingRepository({ ...candidate, recommendation: null }),
    );
    await expect(
      noRecommendation.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: "recommendation-1",
          expectedActiveBranch: "main",
          reason: "Sem recomendação.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "RECOMMENDATION_NOT_FOUND" });

    const unavailable = new BranchRecommendationAcceptanceService(
      new RecordingRepository({
        ...candidate,
        recommendation: {
          ...candidate.recommendation!,
          status: "unavailable",
          branch: null,
        },
      }),
    );
    await expect(
      unavailable.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: candidate.recommendation!.id,
          expectedActiveBranch: "main",
          reason: "Sem branch recomendada.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "RECOMMENDATION_UNAVAILABLE" });
  });

  it("validates confirmation, identifiers and reason before storage", async () => {
    const repository = new RecordingRepository();
    const service = new BranchRecommendationAcceptanceService(repository);

    await expect(
      service.accept(
        {
          repositoryId: " ",
          recommendationId: " ",
          expectedActiveBranch: null,
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
        "REPOSITORY_ID_REQUIRED",
        "RECOMMENDATION_ID_REQUIRED",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("reports an optimistic conflict without claiming acceptance", async () => {
    const repository = new RecordingRepository(candidate, false);
    const service = new BranchRecommendationAcceptanceService(repository);

    await expect(
      service.accept(
        {
          repositoryId: candidate.repository.id,
          recommendationId: candidate.recommendation!.id,
          expectedActiveBranch: "main",
          reason: "Aplicar recomendação atual.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
