import {
  capabilityForCommand,
  resourceKindsForCapability,
} from "./capabilities";
import { readOwnDataArray } from "./data-array";
import type { AgentCapability } from "./types";

export type AgentAuthorizationCommandEntry = {
  commandId: string;
  commandVersion: number;
  capability: AgentCapability;
  resourceType: string;
};

const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const resourceTypePattern = /^[a-z][a-z0-9_-]*$/u;

function plainRecord(value: unknown): value is Record<string, unknown> {
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

function parseEntry(value: unknown): AgentAuthorizationCommandEntry {
  if (
    !plainRecord(value) ||
    typeof value.commandId !== "string" ||
    value.commandId.length > 160 ||
    !commandIdPattern.test(value.commandId) ||
    typeof value.commandVersion !== "number" ||
    !Number.isInteger(value.commandVersion) ||
    value.commandVersion < 1 ||
    typeof value.capability !== "string" ||
    typeof value.resourceType !== "string" ||
    value.resourceType.length > 120 ||
    !resourceTypePattern.test(value.resourceType)
  ) {
    throw new Error("AGENT_AUTHORIZATION_COMMAND_INVALID");
  }

  const capability = capabilityForCommand(value.capability);
  if (!resourceKindsForCapability(capability).includes(value.resourceType)) {
    throw new Error("AGENT_CAPABILITY_RESOURCE_KIND_MISMATCH");
  }

  return {
    commandId: value.commandId,
    commandVersion: value.commandVersion,
    capability,
    resourceType: value.resourceType,
  };
}

export function validateAgentAuthorizationCatalog(
  values: readonly unknown[],
): readonly AgentAuthorizationCommandEntry[] {
  const safeValues = readOwnDataArray(values, {
    minimumItems: 1,
    maximumItems: 500,
  });
  if (safeValues === null) {
    throw new Error("AGENT_AUTHORIZATION_CATALOG_INVALID");
  }

  const entries: AgentAuthorizationCommandEntry[] = [];
  for (const value of safeValues) entries.push(parseEntry(value));
  const keys = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.commandId}@${entry.commandVersion}`;
    if (keys.has(key)) {
      throw new Error("AGENT_AUTHORIZATION_COMMAND_DUPLICATE");
    }
    keys.add(key);
  }

  return entries.sort((left, right) => {
    const byId = left.commandId.localeCompare(right.commandId, "en");
    return byId === 0
      ? left.commandVersion - right.commandVersion
      : byId;
  });
}
