import { normalizeBoundedUniqueIds } from "./id-list";
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

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function ownDataArrayValues(
  value: unknown,
  maximumItems: number,
): readonly unknown[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return null;
    }
    values.push(descriptor.value);
  }
  return values;
}

function boundedCanonicalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    value.trim() === value &&
    canonicalIdPattern.test(value) &&
    !value.includes("//") &&
    !value.split("/").some((segment) => segment === "." || segment === "..")
  );
}

function canonicalPrefixValid(prefix: unknown): prefix is string {
  if (
    typeof prefix !== "string" ||
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

function resourceKindKnown(resourceKind: unknown): resourceKind is string {
  return (
    typeof resourceKind === "string" &&
    resourceKindPattern.test(resourceKind) &&
    reviewedResourceKindSet.has(resourceKind)
  );
}

function parentRefValid(parentRef: unknown): parentRef is CommandResourceParentRef {
  return (
    plainRecord(parentRef) &&
    exactKeys(parentRef, ["id", "kind"]) &&
    resourceKindKnown(parentRef.kind) &&
    boundedCanonicalId(parentRef.id)
  );
}

function commandResourceValid(resource: unknown): resource is CommandResource {
  if (!plainRecord(resource)) return false;
  const parentRefs = ownDataArrayValues(resource.parentRefs, 50);
  return (
    exactKeys(resource, ["id", "kind", "lifecycleState", "parentRefs"]) &&
    resourceKindKnown(resource.kind) &&
    boundedCanonicalId(resource.id) &&
    parentRefs !== null &&
    parentRefs.every(parentRefValid) &&
    (resource.lifecycleState === null ||
      (typeof resource.lifecycleState === "string" &&
        resource.lifecycleState.length >= 1 &&
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
  if (!plainRecord(input.selector) || typeof input.selector.kind !== "string") {
    throw new Error("RESOURCE_SELECTOR_INVALID");
  }

  switch (input.selector.kind) {
    case "all":
      if (!exactKeys(input.selector, ["kind"])) {
        throw new Error("RESOURCE_SELECTOR_INVALID");
      }
      if (input.explicitOwnerSelection !== true) {
        throw new Error("ALL_SELECTOR_REQUIRES_OWNER_SELECTION");
      }
      return;

    case "exact_ids": {
      if (!exactKeys(input.selector, ["ids", "kind"])) {
        throw new Error("RESOURCE_SELECTOR_INVALID");
      }
      const ids = normalizeBoundedUniqueIds(input.selector.ids, {
        minimumItems: 1,
        maximumItems: 200,
        maximumLength: 200,
      });
      if (ids === null || !ids.every(boundedCanonicalId)) {
        throw new Error("INVALID_EXACT_IDS");
      }
      return;
    }

    case "canonical_prefixes": {
      if (!exactKeys(input.selector, ["kind", "prefixes"])) {
        throw new Error("RESOURCE_SELECTOR_INVALID");
      }
      if (input.resourceKind !== "repository_path") {
        throw new Error("RESOURCE_SELECTOR_KIND_UNSUPPORTED");
      }
      const prefixes = normalizeBoundedUniqueIds(input.selector.prefixes, {
        minimumItems: 1,
        maximumItems: 50,
        maximumLength: 200,
      });
      if (prefixes === null || !prefixes.every(canonicalPrefixValid)) {
        throw new Error("INVALID_CANONICAL_PREFIX");
      }
      return;
    }

    case "lifecycle_states": {
      if (!exactKeys(input.selector, ["kind", "states"])) {
        throw new Error("RESOURCE_SELECTOR_INVALID");
      }
      const allowedStates = lifecycleStatesByResourceKind[input.resourceKind];
      if (allowedStates === undefined) {
        throw new Error("RESOURCE_SELECTOR_KIND_UNSUPPORTED");
      }
      const states = normalizeBoundedUniqueIds(input.selector.states, {
        minimumItems: 1,
        maximumItems: 50,
        maximumLength: 80,
      });
      if (
        states === null ||
        !states.every((state) => allowedStates.includes(state))
      ) {
        throw new Error("INVALID_LIFECYCLE_STATE");
      }
      return;
    }

    default:
      throw new Error("RESOURCE_SELECTOR_INVALID");
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
      explicitOwnerSelection:
        plainRecord(input.selector) && input.selector.kind === "all",
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
    default:
      return false;
  }
}
