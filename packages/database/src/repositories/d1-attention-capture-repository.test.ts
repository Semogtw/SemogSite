import type {
  CaptureAuditEvent,
  CapturedAttention,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1AttentionCaptureRepository } from "./d1-attention-capture-repository";

class CapturedStatement implements D1PreparedStatementBinding {
  constructor(
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new CapturedStatement(this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class CapturingD1 implements D1DatabaseBinding {
  batches: readonly D1PreparedStatementBinding[][] = [];
  failSecond = false;

  prepare(query: string): D1PreparedStatementBinding {
    return new CapturedStatement(query);
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches = [...this.batches, [...statements]];
    return statements.map((_, index) =>
      this.failSecond && index === 1
        ? { results: [], success: false, error: "constraint failed" }
        : { results: [], success: true },
    );
  }
}

const attention: CapturedAttention = {
  id: "attention-d1-1",
  projectId: null,
  type: "critical_test",
  status: "open",
  impact: "high",
  title: "Executar preview Cloudflare",
  owner: "external_environment",
  nextAction: "Validar a rota no edge.",
  source: "manual",
  createdAt: "2026-08-09T02:40:00.000Z",
  updatedAt: "2026-08-09T02:40:00.000Z",
};

const audit: CaptureAuditEvent = {
  id: "audit-d1-1",
  actor: "semogtw-owner",
  action: "attention.create",
  entityType: "attention_item",
  entityId: attention.id,
  before: null,
  after: attention,
  reason: "Registrar validação externa ainda pendente.",
  occurredAt: attention.createdAt,
  source: "manual",
  confirmed: true,
  correlationId: "correlation-d1-1",
};

describe("D1AttentionCaptureRepository", () => {
  it("submits the attention and mandatory audit row in one batch", async () => {
    const binding = new CapturingD1();
    const repository = new D1AttentionCaptureRepository(binding);

    await repository.insertAttentionWithAudit(attention, audit);

    expect(binding.batches).toHaveLength(1);
    const [attentionStatement, auditStatement] = binding.batches[0] ?? [];
    expect(attentionStatement).toBeInstanceOf(CapturedStatement);
    expect(auditStatement).toBeInstanceOf(CapturedStatement);

    const attentionParams = (attentionStatement as CapturedStatement).params;
    expect(attentionParams).toContain("attention-d1-1");
    expect(attentionParams).toContain("local_test");
    expect(attentionParams).toContain("external_environment");

    const auditParams = (auditStatement as CapturedStatement).params;
    expect(auditParams).toContain("attention.create");
    expect(auditParams).toContain("correlation-d1-1");
    expect(auditParams).toContain(1);
    expect(auditParams).toContain(JSON.stringify(attention));
  });

  it("surfaces a failed batch result instead of claiming a successful write", async () => {
    const binding = new CapturingD1();
    binding.failSecond = true;
    const repository = new D1AttentionCaptureRepository(binding);

    await expect(
      repository.insertAttentionWithAudit(attention, audit),
    ).rejects.toThrow("D1 attention capture batch failed");
  });
});
