import { describe, expect, it } from "vitest";
import { isCanonicalUtcTimestamp } from "./iso-timestamp";

describe("isCanonicalUtcTimestamp", () => {
  it("accepts exact UTC ISO timestamps with milliseconds", () => {
    expect(isCanonicalUtcTimestamp("2026-08-04T06:00:00.000Z")).toBe(true);
    expect(isCanonicalUtcTimestamp("2026-08-04T06:00:00.123Z")).toBe(true);
  });

  it.each([
    "2026-02-31T06:00:00.000Z",
    "2026-08-04T06:00:00Z",
    "2026-08-04T03:00:00.000-03:00",
    "2026-08-04 06:00:00.000Z",
    "not-a-date",
    "",
  ])("rejects noncanonical timestamp %j", (value) => {
    expect(isCanonicalUtcTimestamp(value)).toBe(false);
  });

  it("rejects non-string runtime values", () => {
    expect(isCanonicalUtcTimestamp(null)).toBe(false);
    expect(isCanonicalUtcTimestamp(1_722_748_400_000)).toBe(false);
  });
});
