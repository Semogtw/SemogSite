import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const obsoleteServerActions = [
  "../server/devos-branch-recommendation.ts",
  "../server/devos-capture.ts",
  "../server/devos-evidence.ts",
  "../server/devos-editorial-redirects.ts",
  "../server/devos-repository-target.ts",
  "../server/devos-run-registration.ts",
  "../server/devos-run-transitions.ts",
  "../server/devos-session-handoff.ts",
  "../server/devos-stage-completion.ts",
  "../server/devos-scope-reservation-override.ts",
  "../server/devos-verification-obligation-result.ts",
] as const;

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("canonical private mutation boundary", () => {
  it("does not keep superseded Node/SQLite mutation actions", () => {
    for (const path of obsoleteServerActions) {
      expect(existsSync(resolve(import.meta.dirname, path)), path).toBe(false);
    }
  });

  it("keeps migrated state writes on the private DevOS client", () => {
    const client = source("../lib/private-devos-client.ts");

    expect(client).toContain("capturePrivateAttention");
    expect(client).toContain("recordPrivateManualEvidence");
    expect(client).toContain("recordPrivateSessionHandoff");
    expect(client).toContain("completePrivateStage");
    expect(client).toContain("registerPrivateRepositoryTarget");
    expect(client).toContain("acceptPrivateBranchRecommendation");
    expect(client).toContain("registerPrivateCooperativeRun");
    expect(client).toContain("transitionPrivateCooperativeRun");
    expect(client).toContain("overridePrivateScopeReservation");
    expect(client).toContain("recordPrivateVerificationObligationResult");
  });
});
