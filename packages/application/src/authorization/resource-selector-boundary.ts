import { readOwnDataArray } from "./data-array";
import { normalizeBoundedUniqueIds } from "./id-list";
import { validateResourceSelectorForKind } from "./resource-selectors";
import type {
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

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

function sanitizeSelector(
  resourceKind: string,
  selector: unknown,
): ResourceSelector {
  const explicitOwnerSelection =
    plainRecord(selector) && selector.kind === "all";
  const typedSelector = selector as ResourceSelector;
  validateResourceSelectorForKind({
    resourceKind,
    selector: typedSelector,
    explicitOwnerSelection,
  });

  switch (typedSelector.kind) {
    case "all":
      return { kind: "all" };
    case "exact_ids": {
      const ids = normalizeBoundedUniqueIds(typedSelector.ids, {
        minimumItems: 1,
        maximumItems: 200,
        maximumLength: 200,
      });
      if (ids === null) throw new Error("INVALID_EXACT_IDS");
      return { kind: "exact_ids", ids };
    }
    case "canonical_prefixes": {
      const prefixes = normalizeBoundedUniqueIds(typedSelector.prefixes, {
        minimumItems: 1,
        maximumItems: 50,
        maximumLength: 200,
      });
      if (prefixes === null) throw new Error("INVALID_CANONICAL_PREFIX");
      return { kind: "canonical_prefixes", prefixes };
    }
    case "lifecycle_states": {
      const states = normalizeBoundedUniqueIds(typedSelector.states, {
        minimumItems: 1,
        maximumItems: 50,
        maximumLength: 80,
      });
      if (states === null) throw new Error("INVALID_LIFECYCLE_STATE");
      return { kind: "lifecycle_states", states };
    }
  }
}

export function sanitizeResourceSelectorMapBoundary(
  value: ResourceSelectorMap,
): ResourceSelectorMap {
  if (!plainRecord(value)) {
    throw new Error("RESOURCE_SELECTOR_MAP_INVALID");
  }

  const sanitized: Record<string, readonly ResourceSelector[]> = {};
  for (const resourceKind of Object.keys(value).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const selectors = readOwnDataArray(value[resourceKind], {
      minimumItems: 1,
      maximumItems: 200,
    });
    if (selectors === null) {
      throw new Error("RESOURCE_SELECTOR_LIST_INVALID");
    }

    const sanitizedSelectors: ResourceSelector[] = [];
    for (const selector of selectors) {
      sanitizedSelectors.push(sanitizeSelector(resourceKind, selector));
    }
    sanitized[resourceKind] = sanitizedSelectors;
  }
  return sanitized;
}
