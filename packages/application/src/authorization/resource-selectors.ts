import type {
  CommandResource,
  CommandResourceParentRef,
  ResourceSelector,
} from "./types";

const canonicalIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const resourceKindPattern = /^[a-z][a-z0-9_-]*$/u;

const lifecycleStatesByResourceKind: Readonly<
  Record<string, readonly string[] | undefined>
> = {
  attention_item: ["dismissed", "monitoring", "open", "resolved"],
  development_request: [
    "active",
    "approved",
    "blocked",
    "cancelled",
    "completed",
    "proposed",
  ],
  editorial_document: [
    "approved",
    "archived",
    "draft",
    "in_review",
    "published",
    "withdrawn",
  ],
  growth_evidence: ["accepted", "proposed", "rejected", "superseded"],
  growth_goal: ["active", "archived", "completed", "draft", "paused"],
  project: ["active", "archived", "completed", "paused", "planned"],
  stage: ["active", "blocked", "completed", "planned"],
  workflow: ["active", "blocked", "cancelled", "completed", "planned"],
};

export const reviewedResourceKinds = [
  "appearance_surface",
  "attention_item",
  "development_request",
  "editorial_document",
  "growth_evidence",
  "growth_goal",
  "integration",
  "project",
  "repository_path",
  "stage",
  "workflow",
] as const;

const reviewedResourceKindSet = new Set<string>(reviewedResourceKinds);

function boundedCanonicalId(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 200 &&
    value.trim() === value &&
    canonicalIdPattern.test(value) &&
    !value.includes("//") &&
    !value.split("/").some((segment) => segment === "." || segment === "..")
  );
}

function uniqueBoundedValues(
  values: readonly string[],
  minimum: number,
  maximum: number,
): boolean {
  return (
    values.length >= minimum &&
    values.length <= maximum &&
    new Set(values).size === values.length
  );
}

function canonicalPrefixValid(prefix: string): boolean {
  if (
    prefix.length < 1 ||
    prefix.length > 200 ||
    prefix.trim() !== prefix ||
    prefix.startsWith("/") ||
    prefix.endsWith("/") ||
    prefix.includes("\\") ||
    prefix.includes("*") ||
    prefix.includes("?") ||
    prefix.includes("#") ||
    prefix.includes("%") ||
    prefix.includes("@") ||
    prefix.includes(":") ||
    prefix.includes("//")
  ) {
    return false;
  }

  const segments = prefix.split("/");
  return (
    segments.length >= 1 &&
    segments.every(
      (segment) =>
        segment.length >= 1 &&
        segment !== "." &&
        segment !== ".." &&
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment),
    )
  );
}

function resourceKindKnown(resourceKind: string): boolean {
  return (
    resourceKindPattern.test(resourceKind) &&
    reviewedResourceKindSet.has(resourceKind)
  );
}

function parentRefValid(parentRef: CommandResourceParentRef): boolean {
  return resourceKindKnown(parentRef.kind) && boundedCanonicalId(parentRef.id);
}

function commandResourceValid(resource: CommandResource): boolean {
  return (
    resourceKindKnown(resource.kind) &&
    boundedCanonicalId(resource.id) &&
    Array.isArray(resource.parentRefs) &&
    resource.parentRefs.length <= 50 &&
    resource.parentRefs.every(parentRefValid) &&
    (resource.lifecycleState === null ||
      (resource.lifecycleState.length >= 1 &&
        resource.lifecycleState.length <= 80 &&
        resource.lifecycleState.trim() === resource.lifecycleState))
  );
}

export function validateResourceSelectorForKind(input: {
  resourceKind: string;
  selector: ResourceSelector;
  explicitOwnerSelection?: boolean;
}): void {
  if (!resourceKindKnown(input.resourceKind)) {
    throw new Error("RESOURCE_KIND_UNKNOWN");
  }

  switch (input.selector.kind) {
    case "all":
      if (input.explicitOwnerSelection !== true) {
        throw new Error("ALL_SELECTOR_REQUIRES_OWNER_SELECTION");
      }
      return;

    case "exact_ids":
      if (
        !uniqueBoundedValues(input.selector.ids, 1, 200) ||
        !input.selector.ids.every(boundedCanonicalId)
      ) {
        throw new Error("INVALID_EXACT_IDS");
      }
      return;

    case "canonical_prefixes":
      if (input.resourceKind !== "repository_path") {
        throw new Error("RESOURCE_SELECTOR_KIND_UNSUPPORTED");
      }
      if (
        !uniqueBoundedValues(input.selector.prefixes, 1, 50) ||
        !input.selector.prefixes.every(canonicalPrefixValid)
      ) {
        throw new Error("INVALID_CANONICAL_PREFIX");
      }
      return;

    case "lifecycle_states": {
      const allowedStates = lifecycleStatesByResourceKind[input.resourceKind];
      if (allowedStates === undefined) {
        throw new Error("RESOURCE_SELECTOR_KIND_UNSUPPORTED");
      }
      if (
        !uniqueBoundedValues(input.selector.states, 1, 50) ||
        !input.selector.states.every((state) => allowedStates.includes(state))
      ) {
        throw new Error("INVALID_LIFECYCLE_STATE");
      }
      return;
    }
  }
}

export function selectorMatchesResource(input: {
  selector: ResourceSelector;
  resource: CommandResource;
}): boolean {
  if (!commandResourceValid(input.resource)) return false;

  try {
    validateResourceSelectorForKind({
      resourceKind: input.resource.kind,
      selector: input.selector,
      explicitOwnerSelection: input.selector.kind === "all",
    });
  } catch {
    return false;
  }

  switch (input.selector.kind) {
    case "all":
      return true;
    case "exact_ids":
      return input.selector.ids.includes(input.resource.id);
    case "canonical_prefixes":
      return input.selector.prefixes.some(
        (prefix) =>
          input.resource.id === prefix ||
          input.resource.id.startsWith(`${prefix}/`),
      );
    case "lifecycle_states":
      return (
        input.resource.lifecycleState !== null &&
        input.selector.states.includes(input.resource.lifecycleState)
      );
  }
}
