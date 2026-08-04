import { describe, expect, it } from "vitest";
import {
  selectorMatchesResource,
  validateResourceSelectorForKind,
} from "./resource-selectors";

const resource = {
  kind: "attention_item",
  id: "attention_1",
  parentRefs: [] as const,
  lifecycleState: "open",
};

describe("resource selector runtime integrity", () => {
  it.each([null, undefined, "all", 1, {}, { kind: "unknown" }])(
    "rejects malformed selector %#",
    (selector) => {
      expect(() =>
        validateResourceSelectorForKind({
          resourceKind: "attention_item",
          selector: selector as never,
          explicitOwnerSelection: true,
        }),
      ).toThrow("RESOURCE_SELECTOR_INVALID");
      expect(
        selectorMatchesResource({
          selector: selector as never,
          resource,
        }),
      ).toBe(false);
    },
  );
});
