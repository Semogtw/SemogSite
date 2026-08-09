import { describe, expect, it } from "vitest";
import type { D1QueryResult } from "../adapters/d1";
import {
  assertD1BatchSucceeded,
  readD1ChangeCount,
  readD1SingleRowChange,
} from "./d1-write-result";

describe("D1 guarded write result helpers", () => {
  it("accepts successful batches", () => {
    expect(() =>
      assertD1BatchSucceeded(
        [
          { results: [], success: true, meta: { changes: 1 } },
          { results: [], success: true, meta: { changes: 1 } },
        ],
        "test write",
      ),
    ).not.toThrow();
  });

  it("rejects explicit D1 failures without relaying provider error text", () => {
    expect(() =>
      assertD1BatchSucceeded(
        [
          {
            results: [],
            success: false,
            error: "sensitive provider detail",
          } as D1QueryResult,
        ],
        "test write",
      ),
    ).toThrow("D1 test write batch failed.");
  });

  it("accepts only non-negative integer changes metadata", () => {
    expect(
      readD1ChangeCount(
        { results: [], success: true, meta: { changes: 0 } },
        "test write",
      ),
    ).toBe(0);
    expect(
      readD1ChangeCount(
        { results: [], success: true, meta: { changes: 3 } },
        "test write",
      ),
    ).toBe(3);

    for (const changes of [undefined, -1, 0.5, Number.NaN]) {
      expect(() =>
        readD1ChangeCount(
          {
            results: [],
            success: true,
            ...(changes === undefined ? {} : { meta: { changes } }),
          } as D1QueryResult,
          "test write",
        ),
      ).toThrow("missing changes metadata");
    }
  });

  it("narrows single-row optimistic writes to zero or one", () => {
    expect(
      readD1SingleRowChange(
        { results: [], success: true, meta: { changes: 0 } },
        "CAS",
      ),
    ).toBe(0);
    expect(
      readD1SingleRowChange(
        { results: [], success: true, meta: { changes: 1 } },
        "CAS",
      ),
    ).toBe(1);
    expect(() =>
      readD1SingleRowChange(
        { results: [], success: true, meta: { changes: 2 } },
        "CAS",
      ),
    ).toThrow("changed more than one row");
  });
});
