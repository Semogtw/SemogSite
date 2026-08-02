import { describe, expect, it } from "vitest";
import {
  EvidenceService,
  type EvidenceWriteRepository,
  type RecordedEvidence,
  type EvidenceAuditEvent,
  type ManualEvidenceKind,
} from "./evidence-service";

const context = {
  actorId: "semogtw-owner",
  evidenceId: "evidence-1",
  auditId: "audit-evidence-1",
  correlationId: "correlation-evidence-1",
  now: "2026-08-01T17:00:00.000Z",
};

class RecordingRepository implements EvidenceWriteRepository {
  calls: Array<{ evidence: RecordedEvidence; audit: EvidenceAuditEvent }> = [];

  async insertEvidenceWithAudit(
    evidence: RecordedEvidence,
    audit: EvidenceAuditEvent,
  ): Promise<void> {
    this.calls.push({ evidence, audit });
  }
}

function validInput() {
  return {
    projectId: " project-1 ",
    stageId: " stage-1 ",
    kind: "test" as const,
    title: "  Vitest do domínio  ",
    url: " https://github.com/Semogtw/SemogSite/actions/runs/1 ",
    externalId: " run-1 ",
    status: "passed" as const,
    summary: "  12 testes aprovados.  ",
    occurredAt: "2026-08-01T16:58:00.000Z",
    reason: " Registrar evidência observada da validação. ",
    confirmed: true,
  };
}

describe("EvidenceService", () => {
  it("normalizes and records confirmed manual evidence with audit", async () => {
    const repository = new RecordingRepository();
    const service = new EvidenceService(repository);

    const result = await service.attachManualEvidence(validInput(), context);

    expect(result).toEqual({
      ok: true,
      evidence: {
        id: "evidence-1",
        projectId: "project-1",
        stageId: "stage-1",
        sessionId: null,
        repositoryId: null,
        kind: "test",
        title: "Vitest do domínio",
        url: "https://github.com/Semogtw/SemogSite/actions/runs/1",
        externalId: "run-1",
        status: "passed",
        summary: "12 testes aprovados.",
        occurredAt: "2026-08-01T16:58:00.000Z",
        capturedAt: context.now,
        sourceHash: null,
        source: "manual",
      },
      audit: {
        id: "audit-evidence-1",
        actor: "semogtw-owner",
        action: "evidence.create",
        entityType: "evidence",
        entityId: "evidence-1",
        before: null,
        after: expect.any(Object),
        reason: "Registrar evidência observada da validação.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-evidence-1",
      },
    });
    expect(repository.calls).toEqual(
      result.ok
        ? [{ evidence: result.evidence, audit: result.audit }]
        : expect.unreachable(),
    );
  });

  it("rejects incomplete evidence and unsafe URLs without writing", async () => {
    const repository = new RecordingRepository();
    const service = new EvidenceService(repository);

    const result = await service.attachManualEvidence(
      {
        ...validInput(),
        projectId: " ",
        title: " ",
        url: "javascript:alert(1)",
        summary: " ",
        occurredAt: "hoje",
        reason: " ",
        confirmed: false,
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        "CONFIRMATION_REQUIRED",
        "PROJECT_ID_REQUIRED",
        "TITLE_REQUIRED",
        "URL_INVALID",
        "SUMMARY_REQUIRED",
        "OCCURRED_AT_INVALID",
        "REASON_REQUIRED",
      ],
    });
    expect(repository.calls).toHaveLength(0);
  });

  it("rejects evidence kinds outside the operational allowlist", async () => {
    const repository = new RecordingRepository();
    const service = new EvidenceService(repository);

    const result = await service.attachManualEvidence(
      {
        ...validInput(),
        kind: "archive" as ManualEvidenceKind,
      },
      context,
    );

    expect(result).toEqual({ ok: false, errors: ["KIND_INVALID"] });
    expect(repository.calls).toHaveLength(0);
  });

  it("preserves a failed status instead of promoting evidence to passed", async () => {
    const repository = new RecordingRepository();
    const service = new EvidenceService(repository);

    const result = await service.attachManualEvidence(
      {
        ...validInput(),
        status: "failed",
        summary: "Dois testes falharam.",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      evidence: { status: "failed" },
    });
  });
});
