import { describe, expect, it } from "vitest";
import { deriveCooperativeRunFreshness } from "./cooperative-run-freshness";

describe("deriveCooperativeRunFreshness", () => {
  it("reports heartbeat age without changing run semantics", () => {
    expect(
      deriveCooperativeRunFreshness(
        {
          lastHeartbeatAt: "2026-08-09T04:00:00.000Z",
          staleAfterSeconds: 1_800,
        },
        new Date("2026-08-09T04:10:00.000Z"),
      ),
    ).toEqual({
      heartbeatAgeSeconds: 600,
      heartbeatExpired: false,
    });
  });

  it("marks a heartbeat expired only after the configured threshold", () => {
    expect(
      deriveCooperativeRunFreshness(
        {
          lastHeartbeatAt: "2026-08-09T04:00:00.000Z",
          staleAfterSeconds: 1_800,
        },
        new Date("2026-08-09T04:30:01.000Z"),
      ),
    ).toEqual({
      heartbeatAgeSeconds: 1_801,
      heartbeatExpired: true,
    });
  });

  it("clamps clock skew instead of returning a negative age", () => {
    expect(
      deriveCooperativeRunFreshness(
        {
          lastHeartbeatAt: "2026-08-09T04:10:00.000Z",
          staleAfterSeconds: 1_800,
        },
        new Date("2026-08-09T04:00:00.000Z"),
      ),
    ).toEqual({
      heartbeatAgeSeconds: 0,
      heartbeatExpired: false,
    });
  });

  it("fails closed for an invalid persisted heartbeat timestamp", () => {
    expect(
      deriveCooperativeRunFreshness(
        {
          lastHeartbeatAt: "invalid",
          staleAfterSeconds: 1_800,
        },
        new Date("2026-08-09T04:00:00.000Z"),
      ),
    ).toEqual({
      heartbeatAgeSeconds: 0,
      heartbeatExpired: true,
    });
  });
});
