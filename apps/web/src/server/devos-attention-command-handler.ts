import type { SqliteDevOSCommandGateway } from "@semogtw/database/commands";

export type DevOSAttentionCommandInput = {
  csrfToken: string;
  idempotencyKey: string;
  attentionId: string;
  expectedUpdatedAt: string;
  targetStatus: "resolved" | "dismissed";
  reason: string;
  confirmed: true;
};

type OwnerIdentity = {
  id: string;
  sessionId: string;
};

type CommandGatewayPort = Pick<SqliteDevOSCommandGateway, "execute">;

export type DevOSAttentionCommandDependencies<Database> = {
  authorizeMutation(csrfToken: string): Promise<OwnerIdentity | null>;
  getDatabase(): Promise<Database | null>;
  createGateway(database: Database): CommandGatewayPort;
};

export type DevOSAttentionCommandResponse =
  | {
      ok: true;
      attentionId: string;
      status: "resolved" | "dismissed";
      replayed: boolean;
      receiptId: string;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      replayed?: boolean;
      receiptId?: string | null;
    };

function commandFailureMessage(code: string): string {
  if (code === "COMMAND_TARGET_NOT_FOUND") {
    return "Este item não existe mais.";
  }
  if (code === "COMMAND_TARGET_CHANGED") {
    return "O item mudou desde a última leitura. Atualize a página e tente novamente.";
  }
  if (code === "IDEMPOTENCY_PAYLOAD_CONFLICT") {
    return "Esta tentativa já foi usada com outro conteúdo. Atualize a página antes de tentar novamente.";
  }
  if (code === "COMMAND_ALREADY_RUNNING") {
    return "Esta alteração já está em execução. Aguarde e atualize a página.";
  }
  if (
    code === "COMMAND_VALIDATION_FAILED" ||
    code === "COMMAND_EXPECTED_STATE_INVALID" ||
    code === "COMMAND_CONFIRMATION_REQUIRED"
  ) {
    return "Informe um motivo válido e confirme a alteração.";
  }
  if (code === "COMMAND_APPROVAL_REQUIRED" || code === "COMMAND_DENIED") {
    return "Esta alteração não está autorizada nesta sessão.";
  }
  return "Não foi possível salvar esta alteração.";
}

function successValue(value: unknown): {
  attentionId: string;
  status: "resolved" | "dismissed";
} | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as { attentionId?: unknown; status?: unknown };
  if (
    typeof candidate.attentionId !== "string" ||
    (candidate.status !== "resolved" && candidate.status !== "dismissed")
  ) {
    return null;
  }
  return {
    attentionId: candidate.attentionId,
    status: candidate.status,
  };
}

export function createDevOSAttentionCommandHandler<Database>(
  dependencies: DevOSAttentionCommandDependencies<Database>,
): (
  input: DevOSAttentionCommandInput,
) => Promise<DevOSAttentionCommandResponse> {
  return async (input) => {
    const owner = await dependencies.authorizeMutation(input.csrfToken);
    if (owner === null) {
      return {
        ok: false,
        code: "MUTATION_NOT_AUTHORIZED",
        message: "Não foi possível autorizar esta alteração.",
      };
    }

    const database = await dependencies.getDatabase();
    if (database === null) {
      return {
        ok: false,
        code: "STORAGE_UNAVAILABLE",
        message: "Não foi possível salvar esta alteração.",
      };
    }

    try {
      const result = await dependencies.createGateway(database).execute({
        commandId: "attention.transition",
        commandVersion: 1,
        target: {
          resourceType: "attention_item",
          resourceId: input.attentionId,
        },
        payload: {
          attentionId: input.attentionId,
          targetStatus: input.targetStatus,
          reason: input.reason,
        },
        expected: { updatedAt: input.expectedUpdatedAt },
        context: {
          ownerId: owner.id,
          actor: { kind: "owner_ui", actorId: owner.id },
          correlationId: `attention-command-${input.idempotencyKey}`,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          confirmed: input.confirmed,
          approvalId: null,
        },
      });

      if (!result.ok) {
        return {
          ok: false,
          code: result.error.code,
          message: commandFailureMessage(result.error.code),
          replayed: result.replayed,
          receiptId: result.receiptId,
        };
      }

      const value = successValue(result.value);
      if (value === null || value.attentionId !== input.attentionId) {
        return {
          ok: false,
          code: "COMMAND_RESULT_INVALID",
          message: "Não foi possível salvar esta alteração.",
          replayed: result.replayed,
          receiptId: result.receiptId,
        };
      }

      return {
        ok: true,
        attentionId: value.attentionId,
        status: value.status,
        replayed: result.replayed,
        receiptId: result.receiptId,
        message:
          value.status === "resolved"
            ? "Item resolvido e auditado."
            : "Item dispensado e auditado.",
      };
    } catch {
      return {
        ok: false,
        code: "COMMAND_EXECUTION_FAILED",
        message: "Não foi possível salvar esta alteração.",
      };
    }
  };
}
