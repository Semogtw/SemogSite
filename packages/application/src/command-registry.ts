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

const definitionKeys = [
  "auditStrategy",
  "bindResource",
  "capability",
  "commandId",
  "commandVersion",
  "confirmation",
  "conflictStrategy",
  "execution",
  "idempotencyStrategy",
  "resourceType",
  "riskFloor",
  "schema",
  "undoStrategy",
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

function dataObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = descriptors[key];
    return (
      descriptor !== undefined &&
      descriptor.enumerable &&
      "value" in descriptor &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    );
  });
}

function definitionShapeValid(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  const allowed = new Set<string>([...definitionKeys, "resultType"]);
  return (
    definitionKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function ownDataArrayValues(
  value: unknown,
  maximumItems: number,
): readonly unknown[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) return null;

  const values: unknown[] = [];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return null;
    }
    values.push(descriptor.value);
  }
  return values;
}

function validateDefinition<Payload extends JsonValue, Result extends JsonValue>(
  definition: CommandDefinition<Payload, Result>,
): void {
  if (
    typeof definition.commandId !== "string" ||
    !commandIdPattern.test(definition.commandId) ||
    definition.commandId.length > 160
  ) {
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
    definition.commandVersion < 1 ||
    definition.commandVersion > 2_147_483_647
  ) {
    throw new Error("COMMAND_VERSION_INVALID");
  }
  if (
    typeof definition.capability !== "string" ||
    !capabilityPattern.test(definition.capability) ||
    definition.capability.length > 160
  ) {
    throw new Error("COMMAND_CAPABILITY_INVALID");
  }
  if (
    typeof definition.resourceType !== "string" ||
    !resourceTypePattern.test(definition.resourceType) ||
    definition.resourceType.length > 120
  ) {
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
    throw new Error("COMMAND_CONFIRMIRMATION_INVALID");
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

function snapshotDefinition(value: unknown): ErasedDefinition {
  if (!dataObject(value) || !definitionShapeValid(value)) {
    throw new Error("COMMAND_DEFINITION_INVALID");
  }
  if (!dataObject(value.schema)) {
    throw new Error("COMMAND_DEFINITION_INVALID");
  }
  const schemaKeys = Object.keys(value.schema);
  if (
    schemaKeys.length !== 1 ||
    schemaKeys[0] !== "parse" ||
    typeof value.schema.parse !== "function" ||
    typeof value.bindResource !== "function"
  ) {
    throw new Error("COMMAND_DEFINITION_INVALID");
  }

  const snapshot = {
    commandId: value.commandId,
    commandVersion: value.commandVersion,
    schema: Object.freeze({ parse: value.schema.parse }),
    capability: value.capability,
    resourceType: value.resourceType,
    bindResource: value.bindResource,
    riskFloor: value.riskFloor,
    confirmation: value.confirmation,
    conflictStrategy: value.conflictStrategy,
    idempotencyStrategy: value.idempotencyStrategy,
    undoStrategy: value.undoStrategy,
    auditStrategy: value.auditStrategy,
    execution: value.execution,
  } as unknown as ErasedDefinition;
  validateDefinition(snapshot);
  return Object.freeze(snapshot);
}

function normalizeCommandTarget(
  value: unknown,
  expectedResourceType: string,
): CommandTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2 ||
    !keys.every((key) => key === "resourceType" || key === "resourceId")
  ) {
    return null;
  }
  const resourceTypeDescriptor = descriptors.resourceType;
  const resourceIdDescriptor = descriptors.resourceId;
  if (
    resourceTypeDescriptor === undefined ||
    resourceIdDescriptor === undefined ||
    !("value" in resourceTypeDescriptor) ||
    !("value" in resourceIdDescriptor) ||
    !resourceTypeDescriptor.enumerable ||
    !resourceIdDescriptor.enumerable ||
    resourceTypeDescriptor.get !== undefined ||
    resourceTypeDescriptor.set !== undefined ||
    resourceIdDescriptor.get !== undefined ||
    resourceIdDescriptor.set !== undefined ||
    resourceTypeDescriptor.value !== expectedResourceType ||
    typeof resourceIdDescriptor.value !== "string" ||
    resourceIdDescriptor.value.trim() !== resourceIdDescriptor.value ||
    resourceIdDescriptor.value.length < 1 ||
    resourceIdDescriptor.value.length > 500
  ) {
    return null;
  }
  return {
    resourceType: expectedResourceType,
    resourceId: resourceIdDescriptor.value,
  };
}

export class CommandRegistry {
  private readonly definitions = new Map<string, ErasedDefinition>();

  constructor(definitions: readonly unknown[] = []) {
    const values = ownDataArrayValues(definitions, 500);
    if (values === null) {
      throw new Error("COMMAND_DEFINITION_INVALID");
    }
    for (const definition of values) this.registerUnknown(definition);
  }

  register<Payload extends JsonValue, Result extends JsonValue>(
    definition: CommandDefinition<Payload, Result>,
  ): void {
    const snapshot = snapshotDefinition(definition);
    const key = definitionKey(snapshot.commandId, snapshot.commandVersion);
    if (this.definitions.has(key)) {
      throw new Error("COMMAND_DEFINITION_DUPLICATE");
    }
    this.definitions.set(key, snapshot);
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
    const target = normalizeCommandTarget(
      definition.bindResource(payload),
      definition.resourceType,
    );
    if (target === null) {
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
    const snapshot = snapshotDefinition(value);
    const key = definitionKey(snapshot.commandId, snapshot.commandVersion);
    if (this.definitions.has(key)) {
      throw new Error("COMMAND_DEFINITION_DUPLICATE");
    }
    this.definitions.set(key, snapshot);
  }
}
