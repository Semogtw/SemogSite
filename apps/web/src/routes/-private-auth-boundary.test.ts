import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("private browser auth boundary", () => {
  it("keeps the entire DevOS subtree client-only", () => {
    expect(source("devos.tsx")).toContain("ssr: false");
  });

  it("uses the canonical auth API instead of the superseded Node session facade", () => {
    const login = source("devos.login.tsx");
    const sessionActions = source("../components/devos/session-actions.tsx");
    const ownerGuard = source("../server/require-owner.ts");

    expect(login).toContain("loginPrivateOwner");
    expect(sessionActions).toContain("logoutPrivateOwner");
    expect(ownerGuard).toContain("getPrivateOwner");
    expect(ownerGuard).not.toContain("resolveCurrentOwner");
    expect(ownerGuard).not.toContain("node-database");
    expect(existsSync(resolve(import.meta.dirname, "../server/auth.ts"))).toBe(false);
  });
});
