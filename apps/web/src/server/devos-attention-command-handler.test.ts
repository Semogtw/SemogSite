import type { SqliteDevOSCommandGateway } from "@semogtw/database/commands";
import { describe, expect, it, vi } from "vitest";
import { createDevOSAttentionCommandHandler } from "./devos-attention-command-handler";

const input = {
  csrfToken: "csrf-token",
  idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
  attentionId: "attention-1",
  expectedUpdatedAt: "2026-08-04T05:30:00.000Z",
  targetStatus: "resolved" as const,
  reason: "O gate foi executado.",
  confirmed: true as const,
};

type Owner = { id: string; sessionId: string };
type TestDatabase = { marker: string };
type GatewayInput = Parameters<SqliteDevOSCommandGateway["execute"]>[0];
type GatewayResult = Awaited<
  ReturnType<SqliteDevOSCommandGateway["execute"]>
>;

function dependencies() {
  const execute = vi.fn<(input: GatewayInput) => Promise<GatewayResult>>(
    async () => ({
      ok: true,
      value: {
        attentionId: "attention-1",
        status: "resolved",
        updatedAt: "2026-08-04T06:00:00.000Z",
      },
      replayed: false,
      receiptId: "receipt-1",
    }),
  );
  const authorizeMutation = vi.fn<
    (csrfToken: string) => Promise<Owner | null>
  >(async () => ({ id: "owner-1", sessionId: "session-1" }));
  const getDatabase = vi.fn<() => Promise<TestDatabase | null>>(
    async () => ({ marker: "database" }),
  );
  const createGateway = vi.fn<
    (database: TestDatabase) => SqliteDevOSCommandGateway
  >(() => ({ execute }));
  return {
    authorizeMutation,
    getDatabase,
    createGateway,
    execute,
  };
}

describe("DevOS Attention command handler", () => {
  it("rejects invalid mutation authorization before opening storage", async () => {
    const deps = dependencies();
    deps.authorizeMutation.mockResolvedValue(null);
    const handler = createDevOSAttentionCommandHandler(deps);

    await expect(handler(input)).resolves.toEqual({
      ok: false,
      code: "MUTATION_NOT_AUTHORIZED",
      message: "Não foi possível autorizar esta alteração.",
    });
    expect(deps.getDatabase).not.toHaveBeenCalled();
    expect(deps.createGateway).not.toHaveBeenCalled();
  });

  it("constructs server-owned command identity, principal and expected state", async () => {
    const deps = dependencies();
    const handler = createDevOSAttentionCommandHandler(deps);

    await expect(handler(input)).resolves.toEqual({
      ok: true,
      attentionId: "attention-1",
      status: "resolved",
      replayed: false,
      receiptId: "receipt-1",
      message: "Item resolvido e auditado.",
    });
    expect(deps.execute).toHaveBeenCalledWith({
      commandId: "attention.transition",
      commandVersion: 1,
      target: {
        resourceType: "attention_item",
        resourceId: "attention-1",
      },
      payload: {
        attentionId: "attention-1",
        targetStatus: "resolved",
        reason: "O gate foi executado.",
      },
      expected: {
        updatedAt: "2026-08-04T05:30:00.000Z",
      },
      context: {
        ownerId: "owner-1",
        actor: { kind: "owner_ui", actorId: "owner-1" },
        correlationId:
          "attention-command-8c8c16cb-7367-4f96-86cf-afbbfbf84122",
        idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
        reason: "O gate foi executado.",
        confirmed: true,
        approvalId: null,
      },
    });
  });

  it("maps stable gateway conflicts without exposing internal details", async () => {
    const deps = dependencies();
    deps.execute.mockResolvedValue({
      ok: false,
      error: {
        code: "COMMAND_TARGET_CHANGED",
        message: "internal gateway message",
        retryable: false,
      },
      replayed: false,
      receiptId: "receipt-1",
    });
    const handler = createDevOSAttentionCommandHandler(deps);

    await expect(handler(input)).resolves.toEqual({
      ok: false,
      code: "COMMAND_TARGET_CHANGED",
      message:
        "O item mudou desde a última leitura. Atualize a página e tente novamente.",
      replayed: false,
      receiptId: "receipt-1",
    });
  });
});
