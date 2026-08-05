import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  agentCapabilities,
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { normalizeBoundedUniqueIds } from "./id-list";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type {
  AgentCapability,
  AgentGrantDefinition,
  AgentGrantStatus,
  AgentRiskCeiling,
} from "./types";

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function statusValid(value: unknown): value is AgentGrantStatus {
  return (
    value === "active" ||
    value === "suspended" ||
    value === "revoked" ||
    value === "expired"
  );
}

function riskValid(value: unknown): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
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

export function sanitizeAgentGrantDefinitionBoundary(
  value: AgentGrantDefinition,
): AgentGrantDefinition | null {
  try {
    if (
      !plainRecord(value) ||
      !exactKeys(value, [
        "capabilities",
        "clientId",
        "expiresAt",
        "id",
        "ownerId",
        "profileId",
        "resourceSelectors",
        "riskCeiling",
        "status",
        "version",
      ]) ||
      !bounded(value.id, 200) ||
      !bounded(value.ownerId, 200) ||
      !bounded(value.clientId, 200) ||
      (value.profileId !== null && !bounded(value.profileId, 200)) ||
      !statusValid(value.status) ||
      !riskValid(value.riskCeiling) ||
      (value.expiresAt !== null &&
        !isCanonicalUtcTimestamp(value.expiresAt)) ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1 ||
      value.version >= Number.MAX_SAFE_INTEGER
    ) {
      return null;
    }

    const capabilityIds = normalizeBoundedUniqueIds(value.capabilities, {
      minimumItems: 1,
      maximumItems: agentCapabilities.length,
      maximumLength: 120,
    });
    if (
      capabilityIds === null ||
      capabilityIds.some((capability) => !isAgentCapability(capability))
    ) {
      return null;
    }
    const capabilities = capabilityIds as readonly AgentCapability[];
    const resourceSelectors = sanitizeResourceSelectorMapBoundary(
      value.resourceSelectors,
    );
    const allowedKinds = new Set(
      capabilities.flatMap((capability) =>
        resourceKindsForCapability(capability),
      ),
    );
    if (
      Object.keys(resourceSelectors).some(
        (resourceKind) => !allowedKinds.has(resourceKind),
      )
    ) {
      return null;
    }
    for (const capability of capabilities) {
      for (const resourceKind of resourceKindsForCapability(capability)) {
        const selectors = resourceSelectors[resourceKind];
        if (!Array.isArray(selectors) || selectors.length === 0) return null;
      }
    }

    return {
      id: value.id,
      ownerId: value.ownerId,
      clientId: value.clientId,
      profileId: value.profileId,
      status: value.status,
      capabilities,
      resourceSelectors,
      riskCeiling: value.riskCeiling,
      expiresAt: value.expiresAt,
      version: value.version,
    };
  } catch {
    return null;
  }
}
