import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  agentCapabilities,
  isAgentCapability,
} from "./capabilities";
import { normalizeBoundedUniqueIds } from "./id-list";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type {
  AgentCapability,
  AgentTrustSession,
  TrustRiskCeiling,
} from "./types";

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function trustRiskValid(value: unknown): value is TrustRiskCeiling {
  return value === "low" || value === "medium";
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

export function sanitizeAgentTrustSessionBoundary(
  value: AgentTrustSession,
): AgentTrustSession | null {
  try {
    if (
      !plainRecord(value) ||
      !exactKeys(value, [
        "baseGrantIds",
        "capabilities",
        "clientId",
        "expiresAt",
        "id",
        "maxOperations",
        "operationsUsed",
        "ownerId",
        "reason",
        "resourceSelectors",
        "revokedAt",
        "riskCeiling",
        "startsAt",
        "version",
      ]) ||
      !bounded(value.id, 200) ||
      !bounded(value.ownerId, 200) ||
      !bounded(value.clientId, 200) ||
      !isCanonicalUtcTimestamp(value.startsAt) ||
      !isCanonicalUtcTimestamp(value.expiresAt) ||
      value.startsAt >= value.expiresAt ||
      (value.revokedAt !== null &&
        !isCanonicalUtcTimestamp(value.revokedAt)) ||
      !trustRiskValid(value.riskCeiling) ||
      !Number.isInteger(value.maxOperations) ||
      value.maxOperations < 1 ||
      value.maxOperations > 100 ||
      !Number.isInteger(value.operationsUsed) ||
      value.operationsUsed < 0 ||
      value.operationsUsed > value.maxOperations ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1 ||
      value.version >= Number.MAX_SAFE_INTEGER ||
      !bounded(value.reason, 500)
    ) {
      return null;
    }

    const baseGrantIds = normalizeBoundedUniqueIds(value.baseGrantIds, {
      minimumItems: 1,
    });
    const capabilityIds = normalizeBoundedUniqueIds(value.capabilities, {
      minimumItems: 1,
      maximumItems: agentCapabilities.length,
      maximumLength: 120,
    });
    if (
      baseGrantIds === null ||
      capabilityIds === null ||
      capabilityIds.some((capability) => !isAgentCapability(capability))
    ) {
      return null;
    }

    return {
      id: value.id,
      ownerId: value.ownerId,
      clientId: value.clientId,
      baseGrantIds,
      capabilities: capabilityIds as readonly AgentCapability[],
      resourceSelectors: sanitizeResourceSelectorMapBoundary(
        value.resourceSelectors,
      ),
      riskCeiling: value.riskCeiling,
      startsAt: value.startsAt,
      expiresAt: value.expiresAt,
      maxOperations: value.maxOperations,
      operationsUsed: value.operationsUsed,
      revokedAt: value.revokedAt,
      reason: value.reason,
      version: value.version,
    };
  } catch {
    return null;
  }
}
