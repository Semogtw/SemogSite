import type {
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

function cloneResourceSelector(selector: ResourceSelector): ResourceSelector {
  switch (selector.kind) {
    case "all":
      return { kind: "all" };
    case "exact_ids":
      return { kind: "exact_ids", ids: [...selector.ids] };
    case "canonical_prefixes":
      return {
        kind: "canonical_prefixes",
        prefixes: [...selector.prefixes],
      };
    case "lifecycle_states":
      return {
        kind: "lifecycle_states",
        states: [...selector.states],
      };
  }
}

export function cloneResourceSelectorMap(
  resourceSelectors: ResourceSelectorMap,
): ResourceSelectorMap {
  const cloned: Record<string, readonly ResourceSelector[]> = {};
  for (const resourceKind of Object.keys(resourceSelectors).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const selectors = resourceSelectors[resourceKind];
    if (selectors !== undefined) {
      cloned[resourceKind] = selectors.map(cloneResourceSelector);
    }
  }
  return cloned;
}
