import {
  agentCapabilities,
  isAgentCapability,
} from "./capabilities";
import { normalizeBoundedUniqueIds } from "./id-list";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type {
  AgentCapability,
  ResourceSelectorMap,
} from "./types";

export type SanitizedTrustSessionRequestBoundary = {
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: ResourceSelectorMap;
};

export function sanitizeTrustSessionRequestBoundary(input: {
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: ResourceSelectorMap;
}): SanitizedTrustSessionRequestBoundary {
  const requestedCapabilities = normalizeBoundedUniqueIds(
    input.requestedCapabilities,
    {
      minimumItems: 1,
      maximumItems: agentCapabilities.length,
      maximumLength: 120,
    },
  );
  if (
    requestedCapabilities === null ||
    requestedCapabilities.some(
      (capability) => !isAgentCapability(capability),
    )
  ) {
    throw new Error("TRUST_CAPABILITY_INVALID");
  }

  let requestedResources: ResourceSelectorMap;
  try {
    requestedResources = sanitizeResourceSelectorMapBoundary(
      input.requestedResources,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "RESOURCE_SELECTOR_MAP_INVALID" ||
        error.message === "RESOURCE_SELECTOR_LIST_INVALID")
    ) {
      throw new Error("TRUST_RESOURCE_SELECTOR_MISSING");
    }
    throw error;
  }

  return {
    requestedCapabilities:
      requestedCapabilities as readonly AgentCapability[],
    requestedResources,
  };
}
