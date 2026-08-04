import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  agentCapabilities,
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { validateResourceSelectorForKind } from "./resource-selectors";
import type {
  AgentCapability,
  AgentRiskCeiling,
  ResourceSelectorMap,
} from "./types";

export type AgentGrantRequest = {
  ownerId: string;
  clientId: string;
  profileId: string | null;
  capabilities: readonly AgentCapability[];
  resourceSelectors: ResourceSelectorMap;
  riskCeiling: AgentRiskCeiling;
  expiresAt: string | null;
  reason: string;
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

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

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function riskValid(value: unknown): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
}

function requestShapeValid(value: unknown): value is AgentGrantRequest {
  return (
    plainRecord(value) &&
    exactKeys(value, [
      "capabilities",
      "clientId",
      "expiresAt",
      "ownerId",
      "profileId",
      "reason",
      "resourceSelectors",
      "riskCeiling",
    ]) &&
    bounded(value.ownerId, 200) &&
    bounded(value.clientId, 200) &&
    (value.profileId === null || bounded(value.profileId, 200)) &&
    bounded(value.reason, 500) &&
    Array.isArray(value.capabilities) &&
    plainRecord(value.resourceSelectors) &&
    riskValid(value.riskCeiling) &&
    (value.expiresAt === null || typeof value.expiresAt === "string")
  );
}

export function validateAgentGrantRequest(input: {
  actor: CommandActor;
  request: AgentGrantRequest;
  now: string;
  explicitAllResourceKinds: readonly string[];
}): AgentGrantRequest {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("AGENT_GRANT_OWNER_REQUIRED");
  }
  if (!requestShapeValid(input.request) || !isCanonicalUtcTimestamp(input.now)) {
    throw new Error("AGENT_GRANT_REQUEST_INVALID");
  }
  if (input.actor.actorId !== input.request.ownerId) {
    throw new Error("AGENT_GRANT_OWNER_MISMATCH");
  }

  const capabilities = input.request.capabilities;
  if (
    capabilities.length < 1 ||
    capabilities.length > agentCapabilities.length ||
    new Set(capabilities).size !== capabilities.length ||
    capabilities.some((capability) => !isAgentCapability(capability))
  ) {
    throw new Error("AGENT_GRANT_CAPABILITY_INVALID");
  }
  if (!riskValid(input.request.riskCeiling)) {
    throw new Error("AGENT_GRANT_RISK_INVALID");
  }

  if (
    input.request.expiresAt !== null &&
    (!isCanonicalUtcTimestamp(input.request.expiresAt) ||
      input.request.expiresAt <= input.now)
  ) {
    throw new Error("AGENT_GRANT_EXPIRY_INVALID");
  }

  if (
    !Array.isArray(input.explicitAllResourceKinds) ||
    new Set(input.explicitAllResourceKinds).size !==
      input.explicitAllResourceKinds.length ||
    input.explicitAllResourceKinds.some((kind) => !bounded(kind, 120))
  ) {
    throw new Error("AGENT_GRANT_REQUEST_INVALID");
  }
  const explicitAll = new Set(input.explicitAllResourceKinds);
  const allowedKinds = new Set(
    capabilities.flatMap((capability) =>
      resourceKindsForCapability(capability),
    ),
  );

  for (const resourceKind of Object.keys(input.request.resourceSelectors)) {
    if (!allowedKinds.has(resourceKind)) {
      throw new Error("AGENT_GRANT_RESOURCE_KIND_NOT_ALLOWED");
    }
  }

  for (const capability of capabilities) {
    for (const resourceKind of resourceKindsForCapability(capability)) {
      const selectors = input.request.resourceSelectors[resourceKind];
      if (!Array.isArray(selectors) || selectors.length === 0) {
        throw new Error("AGENT_GRANT_RESOURCE_SELECTOR_MISSING");
      }
      for (const selector of selectors) {
        validateResourceSelectorForKind({
          resourceKind,
          selector,
          explicitOwnerSelection:
            selector.kind === "all" && explicitAll.has(resourceKind),
        });
      }
    }
  }

  return input.request;
}
