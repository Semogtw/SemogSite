import type { CooperativeRunCommandLifecycleSnapshot } from "./run-command-transition-service";

export type CooperativeRunCommandInboxInput = {
  runId: string;
  observedAt: string;
  limit: number;
};

export interface CooperativeRunCommandInboxRepository {
  listPending(input: {
    runId: string;
    observedAt: string;
    limit: number;
  }): Promise<readonly CooperativeRunCommandLifecycleSnapshot[]>;
}

export type CooperativeRunCommandInboxValidationError =
  | "RUN_ID_REQUIRED"
  | "OBSERVED_AT_INVALID"
  | "LIMIT_INVALID";

export type CooperativeRunCommandInboxResult =
  | {
      ok: true;
      observedAt: string;
      commands: readonly CooperativeRunCommandLifecycleSnapshot[];
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly CooperativeRunCommandInboxValidationError[];
    }
  | { ok: false; code: "INVALID_REPOSITORY_RESULT" };

const maximumLimit = 20;

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

export class CooperativeRunCommandInboxService {
  constructor(private readonly repository: CooperativeRunCommandInboxRepository) {}

  async list(
    input: CooperativeRunCommandInboxInput,
  ): Promise<CooperativeRunCommandInboxResult> {
    const runId = input.runId.trim();
    const observedAt = normalizedIso(input.observedAt);
    const errors: CooperativeRunCommandInboxValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (observedAt === null) errors.push("OBSERVED_AT_INVALID");
    if (!Number.isFinite(input.limit) || input.limit < 1) {
      errors.push("LIMIT_INVALID");
    }
    if (errors.length > 0 || observedAt === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const limit = Math.min(maximumLimit, Math.floor(input.limit));
    const commands = await this.repository.listPending({
      runId,
      observedAt,
      limit,
    });

    const invalid = commands.some((command) => {
      const expiresAt =
        command.expiresAt === null ? null : normalizedIso(command.expiresAt);
      return (
        command.runId !== runId ||
        command.status !== "queued" ||
        (command.expiresAt !== null && expiresAt === null) ||
        (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(observedAt))
      );
    });
    if (invalid) return { ok: false, code: "INVALID_REPOSITORY_RESULT" };

    return { ok: true, observedAt, commands };
  }
}
