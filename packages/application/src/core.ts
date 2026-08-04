export const riskTiers = [
  "read",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type RiskTier = (typeof riskTiers)[number];

export const confirmationOutcomes = [
  "allow",
  "confirm_in_client",
  "prepare_approval",
  "approve_in_devos",
  "deny",
] as const;

export type ConfirmationOutcome = (typeof confirmationOutcomes)[number];

export const conflictStrategies = [
  "none",
  "expected_version",
  "expected_timestamp",
  "expected_hash",
  "exact_snapshot",
] as const;

export type ConflictStrategy = (typeof conflictStrategies)[number];

export const undoStrategies = [
  "none",
  "reversible_command",
  "compensating_command",
  "append_correction",
] as const;

export type UndoStrategy = (typeof undoStrategies)[number];

export const auditStrategies = [
  "receipt_only",
  "state_and_receipt",
  "external_reference_and_receipt",
] as const;

export type AuditStrategy = (typeof auditStrategies)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type CommandActor =
  | {
      kind: "owner_ui";
      actorId: string;
    }
  | {
      kind: "mcp_client";
      actorId: string;
      clientId: string;
      declaredProvider?: string;
      declaredModel?: string;
    }
  | {
      kind: "system";
      actorId: string;
    }
  | {
      kind: "external_adapter";
      actorId: string;
      adapterId: string;
    };

export type CommandContext = {
  ownerId: string;
  actor: CommandActor;
  correlationId: string;
  idempotencyKey: string;
  reason: string;
  confirmed: boolean;
  approvalId: string | null;
};

export type CommandTarget = {
  resourceType: string;
  resourceId: string;
};

export type CommandEnvelope<Payload extends JsonValue = JsonValue> = {
  commandId: string;
  commandVersion: number;
  target: CommandTarget;
  payload: Payload;
  expected: Readonly<Record<string, JsonValue>>;
  context: CommandContext;
};

export type CommandError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type CommandResult<Value extends JsonValue = JsonValue> =
  | {
      ok: true;
      value: Value;
      replayed: boolean;
      receiptId: string;
    }
  | {
      ok: false;
      error: CommandError;
      replayed: boolean;
      receiptId: string | null;
    };

export type AdapterCoverage = "read" | "write" | "not_implemented";

export type CapabilityManifest = {
  commandId: string;
  commandVersion: number;
  capability: string;
  resourceType: string;
  riskFloor: RiskTier;
  confirmation: ConfirmationOutcome;
  conflictStrategy: ConflictStrategy;
  undoStrategy: UndoStrategy;
  auditStrategy: AuditStrategy;
  adapters: {
    ownerUi: AdapterCoverage;
    mcp: AdapterCoverage;
  };
};

export type PolicyDecision = {
  outcome: ConfirmationOutcome;
  risk: RiskTier;
  reasonCode: string;
  approvalId: string | null;
};
