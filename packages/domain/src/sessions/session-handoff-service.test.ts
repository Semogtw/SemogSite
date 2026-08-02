import { describe, expect, it } from "vitest";
import {
  SessionHandoffService,
  type SessionHandoffRepository,
  type RecordedDevelopmentSession,
  type SessionHandoffAuditEvent,
} from "./session-handoff-service";

const context = {
  actorId: "semogtw-owner",
  sessionId: "session-1",
  auditId: "audit-session-1",
  correlationId: "correlation-session-1",
  now: "2026-08-01T16:30:00.000Z",
};

class RecordingRepository implements SessionHandoffRepository {
  calls: Array<{
    session: RecordedDevelopmentSession;
    audit: SessionHandoffAuditEvent;
  }> = [];

  async insertSessionWithAudit(
    session: RecordedDevelopmentSession,
    audit: SessionHandoffAuditEvent,
  ): Promise<void> {
    this.calls.push({ session, audit });
  }
}

function validInput() {
  return {
    projectId: " project-1 ",
    title: "  Continuidade da fundação  ",
    sessionDate: "2026-08-01T16:00:00.000Z",
    branch: " develop/foundation-bootstrap ",
    commits: ["ABCDEF1", "abcdef1", "1234567890abcdef"],
    completedSummary: "  Ciclo de vida de atenção implementado.  ",
    testsStatus: "not_run" as const,
    testsSummary: " Registry indisponível neste runtime. ",
    blockers: " DNS para registry.npmjs.org indisponível. ",
    nextStep: " Implementar persistência do handoff. ",
    result: "significant" as const,
    reason: " Registrar continuidade antes de ampliar a fase. ",
    confirmed: true,
  };
}

describe("SessionHandoffService", () => {
  it("normalizes and persists a confirmed handoff with an audit event", async () => {
    const repository = new RecordingRepository();
    const service = new SessionHandoffService(repository);

    const result = await service.record(validInput(), context);

    expect(result).toEqual({
      ok: true,
      session: {
        id: "session-1",
        projectId: "project-1",
        title: "Continuidade da fundação",
        sessionDate: "2026-08-01T16:00:00.000Z",
        actor: "semogtw-owner",
        branch: "develop/foundation-bootstrap",
        commits: ["abcdef1", "1234567890abcdef"],
        completedSummary: "Ciclo de vida de atenção implementado.",
        testsStatus: "not_run",
        testsSummary: "Registry indisponível neste runtime.",
        blockers: "DNS para registry.npmjs.org indisponível.",
        nextStep: "Implementar persistência do handoff.",
        result: "significant",
        sourceUrl: null,
        automatic: false,
        sourceHash: null,
        source: "manual",
        createdAt: context.now,
        updatedAt: context.now,
      },
      audit: {
        id: "audit-session-1",
        actor: "semogtw-owner",
        action: "development_session.create",
        entityType: "development_session",
        entityId: "session-1",
        before: null,
        after: expect.any(Object),
        reason: "Registrar continuidade antes de ampliar a fase.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-session-1",
      },
    });
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toEqual(
      result.ok
        ? { session: result.session, audit: result.audit }
        : expect.unreachable(),
    );
  });

  it("rejects incomplete handoffs without writing", async () => {
    const repository = new RecordingRepository();
    const service = new SessionHandoffService(repository);

    const result = await service.record(
      {
        ...validInput(),
        title: " ",
        completedSummary: " ",
        testsSummary: " ",
        nextStep: " ",
        reason: " ",
        confirmed: false,
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        "CONFIRMATION_REQUIRED",
        "TITLE_REQUIRED",
        "COMPLETED_SUMMARY_REQUIRED",
        "TESTS_SUMMARY_REQUIRED",
        "NEXT_STEP_REQUIRED",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("rejects invalid dates and commit identifiers", async () => {
    const repository = new RecordingRepository();
    const service = new SessionHandoffService(repository);

    const result = await service.record(
      {
        ...validInput(),
        sessionDate: "ontem",
        commits: ["not-a-sha", "1234"],
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: ["SESSION_DATE_INVALID", "COMMIT_INVALID"],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("preserves the explicitly reported test status instead of inferring it", async () => {
    const repository = new RecordingRepository();
    const service = new SessionHandoffService(repository);

    const result = await service.record(
      {
        ...validInput(),
        testsStatus: "blocked",
        testsSummary: "Dependências não puderam ser instaladas.",
        commits: ["abcdef1234567"],
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      session: {
        testsStatus: "blocked",
        commits: ["abcdef1234567"],
      },
    });
  });
});
