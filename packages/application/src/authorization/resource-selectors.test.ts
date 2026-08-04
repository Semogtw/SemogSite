import { describe, expect, it } from "vitest";
import {
  selectorMatchesResource,
  validateResourceSelectorForKind,
} from "./resource-selectors";
import type { CommandResource, ResourceSelector } from "./types";

const project: CommandResource = {
  kind: "project",
  id: "project_semogsite",
  parentRefs: [],
  lifecycleState: "active",
};

describe("agent resource selectors", () => {
  it("matches exact canonical IDs only", () => {
    expect(
      selectorMatchesResource({
        selector: { kind: "exact_ids", ids: ["project_semogsite"] },
        resource: project,
      }),
    ).toBe(true);
    expect(
      selectorMatchesResource({
        selector: { kind: "exact_ids", ids: ["project_other"] },
        resource: project,
      }),
    ).toBe(false);
  });

  it("does not use parent references as an implicit exact-ID match", () => {
    expect(
      selectorMatchesResource({
        selector: { kind: "exact_ids", ids: ["project_semogsite"] },
        resource: {
          kind: "stage",
          id: "stage_foundation",
          parentRefs: [{ kind: "project", id: "project_semogsite" }],
          lifecycleState: "active",
        },
      }),
    ).toBe(false);
  });

  it("requires explicit owner selection for an all selector", () => {
    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "project",
        selector: { kind: "all" },
      }),
    ).toThrow("ALL_SELECTOR_REQUIRES_OWNER_SELECTION");

    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "project",
        selector: { kind: "all" },
        explicitOwnerSelection: true,
      }),
    ).not.toThrow();
  });

  it.each([
    { kind: "exact_ids", ids: [] },
    { kind: "exact_ids", ids: [" project_semogsite"] },
    { kind: "exact_ids", ids: ["project_semogsite", "project_semogsite"] },
    { kind: "exact_ids", ids: ["x".repeat(201)] },
  ] satisfies readonly ResourceSelector[])(
    "rejects a malformed exact-ID selector %#",
    (selector) => {
      expect(() =>
        validateResourceSelectorForKind({
          resourceKind: "project",
          selector,
        }),
      ).toThrow("INVALID_EXACT_IDS");
    },
  );

  it.each([
    "../secrets",
    "packages/*",
    "packages\\database",
    "https://user:pass@example.com/repo",
    "packages//database",
    "/absolute/path",
    "packages/./database",
    "packages/database/../web",
  ])("rejects unsafe canonical prefix %s", (prefix) => {
    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "repository_path",
        selector: { kind: "canonical_prefixes", prefixes: [prefix] },
      }),
    ).toThrow("INVALID_CANONICAL_PREFIX");
  });

  it("matches a repository prefix at a path boundary", () => {
    const selector: ResourceSelector = {
      kind: "canonical_prefixes",
      prefixes: ["packages/application"],
    };
    validateResourceSelectorForKind({
      resourceKind: "repository_path",
      selector,
    });

    expect(
      selectorMatchesResource({
        selector,
        resource: {
          kind: "repository_path",
          id: "packages/application/src/index.ts",
          parentRefs: [],
          lifecycleState: null,
        },
      }),
    ).toBe(true);
    expect(
      selectorMatchesResource({
        selector,
        resource: {
          kind: "repository_path",
          id: "packages/application-old/src/index.ts",
          parentRefs: [],
          lifecycleState: null,
        },
      }),
    ).toBe(false);
  });

  it("allows only reviewed lifecycle states for lifecycle-aware resources", () => {
    const selector: ResourceSelector = {
      kind: "lifecycle_states",
      states: ["open", "monitoring"],
    };
    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "attention_item",
        selector,
      }),
    ).not.toThrow();
    expect(
      selectorMatchesResource({
        selector,
        resource: {
          kind: "attention_item",
          id: "attention_1",
          parentRefs: [],
          lifecycleState: "monitoring",
        },
      }),
    ).toBe(true);
  });

  it("fails closed for unknown kinds, unsupported selectors and states", () => {
    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "unknown_kind",
        selector: { kind: "exact_ids", ids: ["item_1"] },
      }),
    ).toThrow("RESOURCE_KIND_UNKNOWN");

    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "project",
        selector: { kind: "canonical_prefixes", prefixes: ["project"] },
      }),
    ).toThrow("RESOURCE_SELECTOR_KIND_UNSUPPORTED");

    expect(() =>
      validateResourceSelectorForKind({
        resourceKind: "attention_item",
        selector: { kind: "lifecycle_states", states: ["deleted"] },
      }),
    ).toThrow("INVALID_LIFECYCLE_STATE");
  });
});
