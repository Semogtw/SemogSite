import {
  agentCapabilities,
  isAgentCapability,
} from "./capabilities";
import { readOwnDataArray } from "./data-array";
import { normalizeBoundedUniqueIds } from "./id-list";
import { validateResourceSelectorForKind } from "./resource-selectors";
import type {
  AgentCapability,
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

export type SanitizedTrustSessionRequestBoundary = {
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: ResourceSelectorMap;
};

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
  if (!plainRecord(input.requestedResources)) {
    throw new Error("TRUST_RESOURCE_SELECTOR_MISSING");
  }

  const requestedResources: Record<
    string,
    readonly ResourceSelector[]
  > = {};
  for (const resourceKind of Object.keys(input.requestedResources).sort(
    (left, right) => left.localeCompare(right, "en"),
  )) {
    const selectors = readOwnDataArray(
      input.requestedResources[resourceKind],
      {
        minimumItems: 1,
        maximumItems: 200,
      },
    );
    if (selectors === null) {
      throw new Error("TRUST_RESOURCE_SELECTOR_MISSING");
    }

    const sanitizedSelectors: ResourceSelector[] = [];
    for (const selector of selectors) {
      const typedSelector = selector as ResourceSelector;
      validateResourceSelectorForKind({
        resourceKind,
        selector: typedSelector,
        explicitOwnerSelection: typedSelector.kind === "all",
      });
      sanitizedSelectors.push(typedSelector);
    }
    requestedResources[resourceKind] = sanitizedSelectors;
  }

  return {
    requestedCapabilities:
      requestedCapabilities as readonly AgentCapability[],
    requestedResources,
  };
}
