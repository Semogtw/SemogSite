import { describe, expect, it } from "vitest";
import {
  ScopeReservationService,
  type ScopeReservationRepository,
} from "./scope-reservation-service";
import {
  VerificationObligationService,
  type VerificationObligationRepository,
} from "./verification-obligation-service";

const unreachableScopeRepository: ScopeReservationRepository = {
  async listPotentialOverlaps() {
    throw new Error("repository should not be called");
  },
  async findById() {
    throw new Error("repository should not be called");
  },
  async acquire() {
    throw new Error("repository should not be called");
  },
  async update() {
    throw new Error("repository should not be called");
  },
};

const unreachableVerificationRepository: VerificationObligationRepository = {
  async findById() {
    throw new Error("repository should not be called");
  },
  async create() {
    throw new Error("repository should not be called");
  },
  async update() {
    throw new Error("repository should not be called");
  },
};

describe("orchestration context identity binding", () => {
  it("rejects a reservation lifecycle command whose context names another entity", async () => {
    const service = new ScopeReservationService(unreachableScopeRepository);
    await expect(
      service.renew(
        {
          reservationId: "reservation-1",
          runId: "run-1",
          expectedVersion: 1,
          ttlSeconds: 3_600,
        },
        {
          actorId: "owner-1",
          reservationId: "reservation-other",
          auditId: "audit-1",
          idempotencyKey: "attempt-1",
          correlationId: "correlation-1",
          now: "2026-08-03T12:00:00.000Z",
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONTEXT_RESERVATION_MISMATCH"],
    });
  });

  it("rejects a verification result whose context names another obligation", async () => {
    const service = new VerificationObligationService(
      unreachableVerificationRepository,
    );
    await expect(
      service.recordResult(
        {
          obligationId: "verification-1",
          expectedVersion: 1,
          outcome: "passed",
          failureClassification: null,
          resultSummary: "Passed.",
          evidenceUrls: [],
          nextAction: "Continue.",
        },
        {
          actorId: "owner-1",
          obligationId: "verification-other",
          auditId: "audit-1",
          idempotencyKey: "attempt-1",
          correlationId: "correlation-1",
          now: "2026-08-03T12:00:00.000Z",
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONTEXT_OBLIGATION_MISMATCH"],
    });
  });
});
