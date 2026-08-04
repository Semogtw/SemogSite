import {
  auditStrategies,
  confirmationOutcomes,
  conflictStrategies,
  riskTiers,
  undoStrategies,
  type AuditStrategy,
  type CommandTarget,
  type ConfirmationOutcome,
  type ConflictStrategy,
  type JsonValue,
  type RiskTier,
  type UndoStrategy,
} from "./core";

export type { JsonValue } from "./core";

export type CommandSchema<Value extends JsonValue> = {
  parse(value: unknown): Value;
};

export type IdempotencyStrategy = "required_receipt";
export type CommandExecutionState = "enabled" | "registered_blocked";

export type CommandDefinition<
  Payload extends JsonValue,
  Result extends JsonValue,
> = {
  commandId: string;
  commandVersion: number;
  schema: CommandSchema<Payload>;
  capability: string;
  resourceType: string;
  bindResource(payload: Payload): CommandTarget;
  riskFloor: RiskTier;
  confirmation: ConfirmationOutcome;
  conflictStrategy: ConflictStrategy;
  idempotencyStrategy: IdempotencyStrategy;
  undoStrategy: UndoStrategy;
  auditStrategy: AuditStrategy;
  execution: CommandExecutionState;
  readonly resultType?: Result;
};

export type CommandManifest = {
  commandId: string;
  commandVersion: number;
  capability: string;
  resourceType: string;
  riskFloor: RiskTier;
  confirmation: ConfirmationOutcome;
  conflictStrategy: ConflictStrategy;
  idempotencyStrategy: IdempotencyStrategy;
  undoStrategy: UndoStrategy;
  auditStrategy: AuditStrategy;
  execution: CommandExecutionState;
};

type ErasedDefinition = CommandDefinition<JsonValue, JsonValue>;

const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const capabilityPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const resourceTypePattern = /^[a-z][a-z0-9_-]*$/u;
const forbiddenGenericFragments = [
  "anything",
  "arbitrary",
  "generic_command",
  "execute_sql",
  "run_shell",
  "raw_http",
  "raw_filesystem",
] as const;

function definitionKey(commandId: string, commandVersion: number): string {
  return `${commandId}@${commandVersion}`;
}

function includes<Value extends string>(
  values: readonly Value[],
  value: string,
): value is Value {
  return values.includes(value as Value);
}

function validateDefinition<Payload extends JsonValue, Result extends JsonValue>(
  definition: CommandDefinition<Payload, Result>,
): void {
  if (!commandIdPattern.test(definition.commandId)) {
    throw new Error("COMMAND_ID_INVALID");
  }
  if (
    forbiddenGenericFragments.some((fragment) =>
      definition.commandId.includes(fragment),
    )
  ) {
    throw new Error("COMMAND_ID_FORBIDDEN_GENERIC");
  }
  if (
    !Number.isInteger(definition.commandVersion) ||
    definition.commandVersion < 1
  ) {
    throw new Error("COMMAND_VERSION_INVALID");
  }
  if (!capabilityPattern.test(definition.capability)) {
    throw new Error("COMMAND_CAPABILITY_INVALID");
  }
  if (!resourceTypePattern.test(definition.resourceType)) {
    throw new Error("COMMAND_RESOURCE_TYPE_INVALID");
  }
  if (
    typeof definition.schema?.parse !== "function" ||
    typeof definition.bindResource !== "function"
  ) {
    throw new Error("COMMAND_DEFINITION_INVALID");
  }
  if (!includes(riskTiers, definition.riskFloor)) {
    throw new Error("COMMAND_RISK_INVALID");
  }
  if (!includes(confirmationOutcomes, definition.confirmation)) {
    throw new Error("COMMAND_CONFIRMATION_INVALID");
  }
  if (!includes(conflictStrategies, definition.conflictStrategy)) {
    throw new Error("COMMAND_CONFLICT_STRATEGY_INVALID");
  }
  if (definition.idempotencyStrategy !== "required_receipt") {
    throw new Error("COMMAND_IDEMPOTENCY_STRATEGY_INVALID");
  }
  if (!includes(undoStrategies, definition.undoStrategy)) {
    throw new Error("COMMAND_UNDO_STRATEGY_INVALID");
  }
  if (!includes(auditStrategies, definition.auditStrategy)) {
    throw new Error("COMMAND_AUDIT_STRATEGY_INVALID");
  }
  if (
    definition.execution !== "enabled" &&
    definition.execution !== "registered_blocked"
  ) {
    throw new Error("COMMAND_EXECUTION_STATE_INVALID");
  }
}

function erase<Payload extends JsonValue, Result extends JsonValue>(
  definition: CommandDefinition<Payload, Result>,
): ErasedDefinition {
  return definition as unknown as ErasedDefinition;
}

export class CommandRegistry {
  private readonly definitions = new Map<string, ErasedDefinition>();

  constructor(definitions: readonly unknown[] = []) {
    for (const definition of definitions) {
      this.registerUnknown(definition);
    }
  }

  register<Payload extends JsonValue, Result extends JsonValue>(
    definition: CommandDefinition<Payload, Result>,
  ): void {
    validateDefinition(definition);
    const key = definitionKey(definition.commandId, definition.commandVersion);
    if (this.definitions.has(key)) {
      throw new Error("COMMAND_DEFINITION_DUPLICATE");
    }
    this.definitions.set(key, erase(definition));
  }

  resolve(commandId: string, commandVersion: number): ErasedDefinition {
    const definition = this.definitions.get(
      definitionKey(commandId, commandVersion),
    );
    if (definition === undefined) {
      throw new Error("COMMAND_DEFINITION_NOT_FOUND");
    }
    return definition;
  }

  bindResource(
    commandId: string,
    commandVersion: number,
    rawPayload: unknown,
  ): CommandTarget {
    const definition = this.resolve(commandId, commandVersion);
    const payload = definition.schema.parse(rawPayload);
    const target = definition.bindResource(payload);
    if (
      target.resourceType !== definition.resourceType ||
      target.resourceId.trim() !== target.resourceId ||
      target.resourceId.length < 1 ||
      target.resourceId.length > 500
    ) {
      throw new Error("COMMAND_RESOURCE_INVALID");
    }
    return target;
  }

  listManifests(): readonly CommandManifest[] {
    return [...this.definitions.values()]
      .map(
        (definition): CommandManifest => ({
          commandId: definition.commandId,
          commandVersion: definition.commandVersion,
          capability: definition.capability,
          resourceType: definition.resourceType,
          riskFloor: definition.riskFloor,
          confirmation: definition.confirmation,
          conflictStrategy: definition.conflictStrategy,
          idempotencyStrategy: definition.idempotencyStrategy,
          undoStrategy: definition.undoStrategy,
          auditStrategy: definition.auditStrategy,
          execution: definition.execution,
        }),
      )
      .sort((left, right) => {
        const byId = left.commandId.localeCompare(right.commandId, "en");
        return byId === 0
          ? left.commandVersion - right.commandVersion
          : byId;
      });
  }

  private registerUnknown(value: unknown): void {
    if (typeof value !== "object" || value === null) {
      throw new Error("COMMAND_DEFINITION_INVALID");
    }
    this.register(value as ErasedDefinition);
  }
}
