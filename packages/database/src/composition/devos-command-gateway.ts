import {
  CommandGateway,
  OwnerBrowserPolicy,
  createReceiptClaim,
  transitionAttentionCommand,
  type CommandEnvelope,
  type CommandError,
  type CommandReceiptClaim,
  type CommandResult,
  type JsonValue,
  type PreparedCommand,
  type TransitionAttentionPayload,
} from "@semogtw/application";
import type { SqliteDatabase } from "../adapters/sqlite";
import { createAttentionTransitionCommandRunner } from "../command-runners/attention-transition-command-runner";
import { SqliteCommandReceiptRepository } from "../repositories/command-receipt-repository";
import {
  SqliteTransactionalCommandExecutor,
  type SqliteCommandExecutionResult,
} from "../repositories/sqlite-command-executor";
import { createDevOSCommandRegistry } from "./devos-command-registry";

export type SqliteDevOSCommandGateway = {
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
};

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function failure(
  code: string,
  message: string,
  retryable: boolean,
  input: { replayed?: boolean; receiptId?: string | null } = {},
): CommandResult {
  const error: CommandError = { code, message, retryable };
  return {
    ok: false,
    error,
    replayed: input.replayed ?? false,
    receiptId: input.receiptId ?? null,
  };
}

function timestampValid(value: string): boolean {
  return isoTimestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

function expectedUpdatedAt(prepared: PreparedCommand): string | null {
  const expected = prepared.expected;
  const keys = Reflect.ownKeys(expected);
  if (keys.length !== 1 || keys[0] !== "updatedAt") return null;
  const value = expected.updatedAt;
  return typeof value === "string" && timestampValid(value) ? value : null;
}

function leaseExpiry(claimedAt: string): string | null {
  if (!timestampValid(claimedAt)) return null;
  return new Date(Date.parse(claimedAt) + 5 * 60 * 1000).toISOString();
}

function policyFailure(prepared: PreparedCommand): CommandResult | null {
  switch (prepared.decision.outcome) {
    case "allow":
      return null;
    case "confirm_in_client":
      return failure(
        "COMMAND_CONFIRMATION_REQUIRED",
        "Confirme esta alteração antes de continuar.",
        false,
      );
    case "prepare_approval":
    case "approve_in_devos":
      return failure(
        "COMMAND_APPROVAL_REQUIRED",
        "Esta alteração exige aprovação no DevOS.",
        false,
      );
    case "deny":
      return failure(
        "COMMAND_DENIED",
        "Esta alteração não está autorizada.",
        false,
      );
  }
}

function preparationFailure(error: unknown): CommandResult {
  const code =
    error instanceof Error && error.message === "COMMAND_DEFINITION_NOT_FOUND"
      ? "COMMAND_NOT_FOUND"
      : "COMMAND_VALIDATION_FAILED";
  return failure(
    code,
    code === "COMMAND_NOT_FOUND"
      ? "O comando solicitado não está disponível."
      : "Os dados do comando são inválidos.",
    false,
  );
}

function executionResult(result: SqliteCommandExecutionResult): CommandResult {
  switch (result.kind) {
    case "succeeded":
      return {
        ok: true,
        value: result.summary as JsonValue,
        replayed: result.replayed,
        receiptId: result.receiptId,
      };
    case "failed":
      return failure(
        result.stableErrorCode,
        "O comando não pôde ser aplicado.",
        result.retryable,
        { replayed: result.replayed, receiptId: result.receiptId },
      );
    case "in_progress":
      return failure(
        "COMMAND_ALREADY_RUNNING",
        "Este comando já está em execução.",
        true,
        { receiptId: result.receiptId },
      );
    case "conflict":
      return failure(
        "IDEMPOTENCY_PAYLOAD_CONFLICT",
        "A mesma chave já foi usada para outro conteúdo.",
        false,
      );
  }
}

export function createSqliteDevOSCommandGateway(input: {
  database: SqliteDatabase;
  now: () => string;
  randomUUID: () => string;
}): SqliteDevOSCommandGateway {
  const preparation = new CommandGateway(
    createDevOSCommandRegistry(),
    new OwnerBrowserPolicy(),
  );
  const executor = new SqliteTransactionalCommandExecutor(
    input.database,
    new SqliteCommandReceiptRepository(input.database),
  );

  return {
    async execute(envelope) {
      let prepared: PreparedCommand;
      try {
        prepared = preparation.prepare(envelope);
      } catch (error) {
        return preparationFailure(error);
      }

      const denied = policyFailure(prepared);
      if (denied !== null) return denied;

      if (
        prepared.commandId !== transitionAttentionCommand.commandId ||
        prepared.commandVersion !== transitionAttentionCommand.commandVersion
      ) {
        return failure(
          "COMMAND_EXECUTION_NOT_AVAILABLE",
          "O executor deste comando ainda não está disponível.",
          false,
        );
      }

      const expected = expectedUpdatedAt(prepared);
      if (expected === null) {
        return failure(
          "COMMAND_EXPECTED_STATE_INVALID",
          "O estado esperado do item é inválido.",
          false,
        );
      }

      const claimedAt = input.now();
      const leaseExpiresAt = leaseExpiry(claimedAt);
      if (leaseExpiresAt === null) {
        return failure(
          "COMMAND_CLOCK_INVALID",
          "O relógio do servidor não produziu um instante válido.",
          true,
        );
      }

      let claim: CommandReceiptClaim;
      let payload: TransitionAttentionPayload;
      try {
        claim = createReceiptClaim(prepared, {
          receiptId: `command-receipt-${input.randomUUID()}`,
          claimedAt,
          leaseExpiresAt,
        });
        payload = transitionAttentionCommand.schema.parse(prepared.payload);
      } catch {
        return failure(
          "COMMAND_VALIDATION_FAILED",
          "Os dados do comando são inválidos.",
          false,
        );
      }

      const result = await executor.execute(
        { claim, completedAt: claimedAt },
        createAttentionTransitionCommandRunner({
          database: input.database,
          payload,
          expectedUpdatedAt: expected,
          now: claimedAt,
        }),
      );
      return executionResult(result);
    },
  };
}
