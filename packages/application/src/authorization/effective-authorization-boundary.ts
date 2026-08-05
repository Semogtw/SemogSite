import {
  agentCapabilities,
  isAgentCapability,
} from "./capabilities";
import { readOwnDataArray } from "./data-array";
import { normalizeBoundedUniqueIds } from "./id-list";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type {
  AgentCapability,
  AgentRiskCeiling,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
  ResourceSelectorMap,
} from "./types";

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
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

function sanitizeCapabilitySelectorMaps(
  value: unknown,
  capabilities: ReadonlySet<AgentCapability>,
): EffectiveAgentAuthorization["capabilityResourceSelectors"] {
  if (!plainRecord(value)) {
    throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
  }

  const sanitized: Partial<Record<AgentCapability, ResourceSelectorMap>> = {};
  for (const capability of Object.keys(value).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    if (!isAgentCapability(capability) || !capabilities.has(capability)) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
    sanitized[capability] = sanitizeResourceSelectorMapBoundary(
      value[capability] as ResourceSelectorMap,
    );
  }
  for (const capability of capabilities) {
    if (sanitized[capability] === undefined) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
  }
  return sanitized;
}

function sanitizeRiskMap(
  value: unknown,
  capabilities: ReadonlySet<AgentCapability>,
): EffectiveAgentAuthorization["riskCeilingByCapability"] {
  if (!plainRecord(value)) {
    throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
  }

  const sanitized: Partial<Record<AgentCapability, AgentRiskCeiling>> = {};
  for (const capability of Object.keys(value).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const risk = value[capability];
    if (
      !isAgentCapability(capability) ||
      !capabilities.has(capability) ||
      !riskValid(risk)
    ) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
    sanitized[capability] = risk;
  }
  for (const capability of capabilities) {
    if (sanitized[capability] === undefined) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
  }
  return sanitized;
}

function sanitizeClauses(input: {
  value: unknown;
  capabilities: ReadonlySet<AgentCapability>;
  grantIds: ReadonlySet<string>;
}): readonly EffectiveAgentAuthorizationClause[] {
  const clauses = readOwnDataArray(input.value, {
    minimumItems: 1,
    maximumItems: 10_000,
  });
  if (clauses === null) {
    throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
  }

  const sanitized: EffectiveAgentAuthorizationClause[] = [];
  for (const clause of clauses) {
    if (
      !plainRecord(clause) ||
      !exactKeys(clause, [
        "capability",
        "grantId",
        "resourceSelectors",
        "riskCeiling",
      ]) ||
      !bounded(clause.grantId, 200) ||
      !isAgentCapability(clause.capability) ||
      !input.capabilities.has(clause.capability) ||
      !input.grantIds.has(clause.grantId) ||
      !riskValid(clause.riskCeiling)
    ) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
    sanitized.push({
      grantId: clause.grantId,
      capability: clause.capability,
      resourceSelectors: sanitizeResourceSelectorMapBoundary(
        clause.resourceSelectors as ResourceSelectorMap,
      ),
      riskCeiling: clause.riskCeiling,
    });
  }
  return sanitized;
}

export function sanitizeEffectiveAgentAuthorizationBoundary(
  value: EffectiveAgentAuthorization,
): EffectiveAgentAuthorization {
  try {
    if (
      !plainRecord(value) ||
      !exactKeys(value, [
        "authorizationClauses",
        "capabilities",
        "capabilityResourceSelectors",
        "clientId",
        "grantIds",
        "ownerId",
        "resourceSelectors",
        "riskCeiling",
        "riskCeilingByCapability",
        "trustSessionIds",
      ]) ||
      !bounded(value.ownerId, 200) ||
      !bounded(value.clientId, 200) ||
      !riskValid(value.riskCeiling)
    ) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
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
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
    const capabilities = capabilityIds as readonly AgentCapability[];
    const capabilitySet = new Set(capabilities);

    const grantIds = normalizeBoundedUniqueIds(value.grantIds, {
      minimumItems: 1,
    });
    const trustSessionIds = normalizeBoundedUniqueIds(value.trustSessionIds);
    if (grantIds === null || trustSessionIds === null) {
      throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
    }
    const grantIdSet = new Set(grantIds);

    const resourceSelectors = sanitizeResourceSelectorMapBoundary(
      value.resourceSelectors,
    );
    const capabilityResourceSelectors = sanitizeCapabilitySelectorMaps(
      value.capabilityResourceSelectors,
      capabilitySet,
    );
    const riskCeilingByCapability = sanitizeRiskMap(
      value.riskCeilingByCapability,
      capabilitySet,
    );
    const authorizationClauses = sanitizeClauses({
      value: value.authorizationClauses,
      capabilities: capabilitySet,
      grantIds: grantIdSet,
    });

    return {
      clientId: value.clientId,
      ownerId: value.ownerId,
      capabilities,
      resourceSelectors,
      capabilityResourceSelectors,
      riskCeiling: value.riskCeiling,
      riskCeilingByCapability,
      authorizationClauses,
      grantIds,
      trustSessionIds,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EFFECTIVE_AUTHORIZATION_INVALID"
    ) {
      throw error;
    }
    throw new Error("EFFECTIVE_AUTHORIZATION_INVALID");
  }
}
