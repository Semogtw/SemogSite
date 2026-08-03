import { describe, expect, it } from "vitest";
import {
  deriveScopeReservationFreshness,
  normalizeScopePatterns,
  scopeReservationsOverlap,
  type ScopeReservationSnapshot,
} from "./scope-reservation";

function reservation(
  overrides: Partial<ScopeReservationSnapshot> = {},
): ScopeReservationSnapshot {
  return {
    id: "reservation-1",
    projectId: "project-1",
    repositoryId: "repository-1",
    runId: "run-1",
    branch: "develop/workflow-control-core",
    kind: "directory",
    patterns: ["apps/web/**"],
    holderLabel: "agent-a",
    purpose: "Implement project workflow controls.",
    state: "active",
    acquiredAt: "2026-08-03T08:00:00.000Z",
    renewedAt: "2026-08-03T08:10:00.000Z",
    expiresAt: "2026-08-03T09:10:00.000Z",
    releasedAt: null,
    version: 1,
    ...overrides,
  };
}

describe("normalizeScopePatterns", () => {
  it("trims, deduplicates and sorts exact paths and directory scopes", () => {
    expect(
      normalizeScopePatterns([
        " packages/domain/src/index.ts ",
        "apps/web/**",
        "packages/domain/src/index.ts",
      ]),
    ).toEqual({
      ok: true,
      patterns: ["apps/web/**", "packages/domain/src/index.ts"],
    });
  });

  it("rejects traversal, absolute paths, backslashes and unsupported globs", () => {
    expect(normalizeScopePatterns(["../secrets"])).toEqual({
      ok: false,
      code: "SCOPE_PATTERN_INVALID",
      pattern: "../secrets",
    });
    expect(normalizeScopePatterns(["/apps/web"])).toMatchObject({
      ok: false,
      code: "SCOPE_PATTERN_INVALID",
    });
    expect(normalizeScopePatterns(["apps\\web"])).toMatchObject({
      ok: false,
      code: "SCOPE_PATTERN_INVALID",
    });
    expect(normalizeScopePatterns(["apps/*/routes"])).toMatchObject({
      ok: false,
      code: "SCOPE_PATTERN_INVALID",
    });
  });
});

describe("deriveScopeReservationFreshness", () => {
  it("uses an inclusive expiry boundary without mutating persisted state", () => {
    const active = reservation();
    expect(
      deriveScopeReservationFreshness(active, "2026-08-03T09:09:59.999Z"),
    ).toEqual({ status: "active", expiresAt: active.expiresAt });
    expect(
      deriveScopeReservationFreshness(active, "2026-08-03T09:10:00.000Z"),
    ).toEqual({ status: "expired", expiresAt: active.expiresAt });
    expect(active.state).toBe("active");
  });

  it("keeps released history inactive even before the previous expiry", () => {
    const released = reservation({
      state: "released",
      releasedAt: "2026-08-03T08:20:00.000Z",
    });
    expect(
      deriveScopeReservationFreshness(released, "2026-08-03T08:30:00.000Z"),
    ).toEqual({ status: "inactive", expiresAt: released.expiresAt });
  });
});

describe("scopeReservationsOverlap", () => {
  const observedAt = "2026-08-03T08:30:00.000Z";

  it("detects repository-wide and file/directory overlap on the same branch", () => {
    expect(
      scopeReservationsOverlap(
        reservation({ kind: "repository", patterns: ["**"] }),
        reservation({
          id: "reservation-2",
          kind: "files",
          patterns: ["packages/domain/src/index.ts"],
        }),
        observedAt,
      ),
    ).toEqual({ overlaps: true, reason: "REPOSITORY_SCOPE" });

    expect(
      scopeReservationsOverlap(
        reservation(),
        reservation({
          id: "reservation-2",
          kind: "files",
          patterns: ["apps/web/src/routes/devos.tsx"],
        }),
        observedAt,
      ),
    ).toEqual({ overlaps: true, reason: "PATH_SCOPE" });
  });

  it("does not overlap different repositories, branches or expired scopes", () => {
    expect(
      scopeReservationsOverlap(
        reservation(),
        reservation({ id: "reservation-2", repositoryId: "repository-2" }),
        observedAt,
      ),
    ).toEqual({ overlaps: false, reason: null });
    expect(
      scopeReservationsOverlap(
        reservation(),
        reservation({ id: "reservation-2", branch: "main" }),
        observedAt,
      ),
    ).toEqual({ overlaps: false, reason: null });
    expect(
      scopeReservationsOverlap(
        reservation({ expiresAt: "2026-08-03T08:29:59.000Z" }),
        reservation({ id: "reservation-2" }),
        observedAt,
      ),
    ).toEqual({ overlaps: false, reason: null });
  });

  it("compares issue, stage and custom labels only inside the same kind", () => {
    const issue = reservation({
      kind: "issue",
      patterns: ["123"],
    });
    expect(
      scopeReservationsOverlap(
        issue,
        reservation({ id: "reservation-2", kind: "issue", patterns: ["123"] }),
        observedAt,
      ),
    ).toEqual({ overlaps: true, reason: "IDENTITY_SCOPE" });
    expect(
      scopeReservationsOverlap(
        issue,
        reservation({ id: "reservation-2", kind: "stage", patterns: ["123"] }),
        observedAt,
      ),
    ).toEqual({ overlaps: false, reason: null });
  });
});
