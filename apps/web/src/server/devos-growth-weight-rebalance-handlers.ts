import type {
  ApplyCheckpointWeightRebalanceInput,
  ApplyCheckpointWeightRebalanceResult,
  GrowthMutationContext,
  PreviewCheckpointWeightRebalanceResult,
} from "@semogtw/domain/growth";

export type GrowthWeightRebalanceOwner = {
  id: string;
  sessionId: string;
};

export type GrowthWeightRebalanceServicePort = {
  preview(
    input: { goalId: string },
    context: GrowthMutationContext,
  ): Promise<PreviewCheckpointWeightRebalanceResult>;
  apply(
    input: ApplyCheckpointWeightRebalanceInput,
    context: GrowthMutationContext,
  ): Promise<ApplyCheckpointWeightRebalanceResult>;
};

export type DevOSGrowthWeightRebalanceDependencies = {
  resolveOwner(): Promise<GrowthWeightRebalanceOwner | null>;
  authorizeMutation(
    csrfToken: string,
  ): Promise<GrowthWeightRebalanceOwner | null>;
  createService(): Promise<GrowthWeightRebalanceServicePort>;
  nextCorrelationId(): string;
};

export type ApplyGrowthWeightRebalanceRequest =
  ApplyCheckpointWeightRebalanceInput & {
    csrfToken: string;
    idempotencyKey: string;
  };

export function createDevOSGrowthWeightRebalanceHandlers(
  dependencies: DevOSGrowthWeightRebalanceDependencies,
) {
  return {
    async preview(input: { goalId: string }) {
      const owner = await dependencies.resolveOwner();
      if (owner === null) {
        return { ok: false as const, code: "UNAUTHORIZED" as const };
      }
      try {
        const correlationId = dependencies.nextCorrelationId();
        const service = await dependencies.createService();
        return service.preview(input, {
          ownerId: owner.id,
          actorId: owner.id,
          correlationId,
          idempotencyKey: `preview:${correlationId}`,
        });
      } catch {
        return { ok: false as const, code: "READ_FAILED" as const };
      }
    },

    async apply(input: ApplyGrowthWeightRebalanceRequest) {
      const owner = await dependencies.authorizeMutation(input.csrfToken);
      if (owner === null) {
        return { ok: false as const, code: "CSRF_INVALID" as const };
      }
      try {
        const service = await dependencies.createService();
        return service.apply(
          {
            goalId: input.goalId,
            expectedGoalVersion: input.expectedGoalVersion,
            expectedCheckpointVersions: input.expectedCheckpointVersions,
            reason: input.reason,
            confirmed: input.confirmed,
          },
          {
            ownerId: owner.id,
            actorId: owner.id,
            correlationId: dependencies.nextCorrelationId(),
            idempotencyKey: input.idempotencyKey,
          },
        );
      } catch {
        return { ok: false as const, code: "WRITE_FAILED" as const };
      }
    },
  } as const;
}
