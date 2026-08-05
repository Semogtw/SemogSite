import {
  agentCapabilities,
  isAgentCapability,
} from "./capabilities";
import { readOwnDataArray } from "./data-array";
import { normalizeBoundedUniqueIds } from "./id-list";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type {
  AgentCapability,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
} from "./types";

export type PolicyAuthorizationBoundary = {
  capabilities: readonly AgentCapability[];
  authorizationClauses: readonly EffectiveAgentAuthorizationClause[];
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function riskValid(value: unknown): value is "low" | "medium" | "high" {
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

export function sanitizePolicyAuthorizationBoundary(
  value: EffectiveAgentAuthorization,
): PolicyAuthorizationBoundary | null {
  if (!plainRecord(value)) return null;

  const capabilityIds = normalizeBoundedUniqueIds(value.capabilities, {
    minimumItems: 1,
    maximumItems: agentCapabilities.length,
    maximumLength: 120,
  });
  const clauses = readOwnDataArray(value.authorizationClauses, {
    maximumItems: 10_000,
  });
  if (
    capabilityIds === null ||
    capabilityIds.some((capability) => !isAgentCapability(capability)) ||
    clauses === null
  ) {
    return null;
  }

  const authorizationClauses: EffectiveAgentAuthorizationClause[] = [];
  for (const clause of clauses) {
    if (
      !plainRecord(clause) ||
      !bounded(clause.grantId, 200) ||
      typeof clause.capability !== "string" ||
      !isAgentCapability(clause.capability) ||
      !riskValid(clause.riskCeiling)
    ) {
      continue;
    }
    try {
      authorizationClauses.push({
        grantId: clause.grantId,
        capability: clause.capability,
        resourceSelectors: sanitizeResourceSelectorMapBoundary(
          clause.resourceSelectors as never,
        ),
        riskCeiling: clause.riskCeiling,
      });
    } catch {
      continue;
    }
  }

  return {
    capabilities: capabilityIds as readonly AgentCapability[],
    authorizationClauses,
  };
}
