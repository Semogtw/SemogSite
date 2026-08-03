import { describe, expect, it } from "vitest";
import {
  ScopeReservationService,
  type ScopeReservationAuditEvent,
  type ScopeReservationRepository,
  type ScopeReservationSnapshot,
  type ScopeReservationStoreResult,
} from "./scope-reservation-service";

class MemoryRepository implements ScopeReservationRepository {
  reservations = new Map<string, ScopeReservationSnapshot>();
  audits: ScopeReservationAuditEvent[] = [];
  acquireResult: ScopeReservationStoreResult = "created";
  updateResult: ScopeReservationStoreResult = "updated";

  async listPotentialOverlaps(
    repositoryId: string,
    branch: string,
  ): Promise<readonly ScopeReservationSnapshot[]> {
    return [...this.reservations.values()].filter(
      (item) => item.repositoryId === repositoryId && item.branch === branch,
    );
  }

  async findById(id: string): Promise<ScopeReservationSnapshot | null> {
    return this.reservations.get(id) ?? null;
  }

  async acquire(
    reservation: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
    if (this.acquireResult === "created") {
      this.reservations.set(reservation.id, reservation);
      this.audits.push(audit);
    }
    return this.acquireResult;
  }

  async update(
    before: ScopeReservationSnapshot,
    after: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
    if (this.updateResult === "updated") {
      const current = this.reservations.get(before.id);
      if (current?.version !== before.version) return "conflict";
      this.reservations.set(after.id, after);
      this.audits.push(audit);
    }
    return this.updateResult;
  }
}

const context = {
  actorId: "owner-1",
  reservationId: "reservation-1",
  auditId: "audit-1",
  idempotencyKey: "attempt-1",
  correlationId: "correlation-1",
  now: "2026-08-03T08:00:00.000Z",
};

const acquireInput = {
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "run-1",
  branch: "develop/workflow-control-core",
  kind: "directory" as const,
  patterns: [" packages/domain/** ", "packages/domain/**"],
  holderLabel: "agent-a",
  purpose: "Implement orchestration domain services.",
  ttlSeconds: 3_600,
  acknowledgeOverlap: false,
};

function existing(
  overrides: Partial<ScopeReservationSnapshot> = {},
): ScopeReservationSnapshot {
  return {
    id: "existing-reservation",
    projectId: "project-1",
    repositoryId: "repository-1",
    runId: "run-2",
    branch: "develop/workflow-control-core",
    kind: "files",
    patterns: ["packages/domain/src/index.ts"],
    holderLabel: "agent-b",
    purpose: "Modify domain exports.",
    state: "active",
    acquiredAt: "2026-08-03T07:30:00.000Z",
    renewedAt: "2026-08-03T07:30:00.000Z",
    expiresAt: "2026-08-03T09:00:00.000Z",
    releasedAt: null,
    version: 1,
    ...overrides,
  };
}

describe("ScopeReservationService.acquire", () => {
  it("normalizes scope and creates an auditable expiring reservation", async () => {
    const repository = new MemoryRepository();
    const service = new ScopeReservationService(repository);

    const result = await service.acquire(acquireInput, context);

    expect(result).toEqual({
      ok: true,
      reservation: {
        id: "reservation-1",
        projectId: "project-1",
        repositoryId: "repository-1",
        runId: "run-1",
        branch: "develop/workflow-control-core",
        kind: "directory",
        patterns: ["packages/domain/**"],
        holderLabel: "agent-a",
        purpose: "Implement orchestration domain services.",
        state: "active",
        acquiredAt: "2026-08-03T08:00:00.000Z",
        renewedAt: "2026-08-03T08:00:00.000Z",
        expiresAt: "2026-08-03T09:00:00.000Z",
        releasedAt: null,
        version: 1,
      },
      overlaps: [],
      audit: expect.objectContaining({
        action: "scope_reservation.acquire",
        actor: "owner-1",
        before: null,
        reason: "Implement orchestration domain services.",
      }),
    });
  });

  it("blocks overlap unless the caller explicitly acknowledges it", async () => {
    const repository = new MemoryRepository();
    repository.reservations.set("existing-reservation", existing());
    const service = new ScopeReservationService(repository);

    expect(await service.acquire(acquireInput, context)).toEqual({
      ok: false,
      code: "OVERLAP_CONFLICT",
      overlaps: ["existing-reservation"],
    });

    const accepted = await service.acquire(
      { ...acquireInput, acknowledgeOverlap: true },
      context,
    );
    expect(accepted).toMatchObject({
      ok: true,
      overlaps: ["existing-reservation"],
      audit: { confirmed: true },
    });
  });
});

describe("ScopeReservationService lifecycle", () => {
  it("renews only an active reservation owned by the same run", async () => {
    const repository = new MemoryRepository();
    repository.reservations.set("reservation-1", existing({
      id: "reservation-1",
      runId: "run-1",
    }));
    const service = new ScopeReservationService(repository);

    const result = await service.renew(
      {
        reservationId: "reservation-1",
        runId: "run-1",
        expectedVersion: 1,
        ttlSeconds: 7_200,
      },
      { ...context, now: "2026-08-03T08:30:00.000Z" },
    );

    expect(result).toMatchObject({
      ok: true,
      reservation: {
        version: 2,
        renewedAt: "2026-08-03T08:30:00.000Z",
        expiresAt: "2026-08-03T10:30:00.000Z",
      },
      audit: { action: "scope_reservation.renew" },
    });

    expect(
      await service.renew(
        {
          reservationId: "reservation-1",
          runId: "another-run",
          expectedVersion: 2,
          ttlSeconds: 3_600,
        },
        { ...context, now: "2026-08-03T08:40:00.000Z" },
      ),
    ).toEqual({ ok: false, code: "NOT_OWNER" });
  });

  it("releases cooperatively and supports a confirmed owner override", async () => {
    const repository = new MemoryRepository();
    repository.reservations.set("reservation-1", existing({
      id: "reservation-1",
      runId: "run-1",
    }));
    const service = new ScopeReservationService(repository);

    const released = await service.release(
      {
        reservationId: "reservation-1",
        runId: "run-1",
        expectedVersion: 1,
        reason: "Run reached a safe checkpoint.",
      },
      { ...context, now: "2026-08-03T08:20:00.000Z" },
    );
    expect(released).toMatchObject({
      ok: true,
      reservation: {
        state: "released",
        releasedAt: "2026-08-03T08:20:00.000Z",
        version: 2,
      },
    });

    repository.reservations.set("reservation-2", existing({ id: "reservation-2" }));
    const overridden = await service.override(
      {
        reservationId: "reservation-2",
        expectedVersion: 1,
        reason: "The previous session is stale and work must continue.",
        confirmed: true,
      },
      {
        ...context,
        reservationId: "reservation-2",
        auditId: "audit-2",
        now: "2026-08-03T08:25:00.000Z",
      },
    );
    expect(overridden).toMatchObject({
      ok: true,
      reservation: { state: "overridden", version: 2 },
      audit: {
        action: "scope_reservation.override",
        confirmed: true,
      },
    });
  });
});
