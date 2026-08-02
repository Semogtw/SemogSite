import { afterEach, describe, expect, it } from "vitest";
import {
  getWebAuthProvider,
  getWebSessionSecret,
  resetWebAuthForTests,
} from "./auth-runtime";
import {
  ensureWebAuthConfigured,
  resetNodeAuthCompositionForTests,
} from "./node-auth-composition.server";
import {
  getNodeDatabase,
  resetNodeDatabaseForTests,
} from "./node-database.server";

const originalEnv = { ...process.env };
const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

afterEach(() => {
  process.env = { ...originalEnv };
  resetWebAuthForTests();
  resetNodeAuthCompositionForTests();
  resetNodeDatabaseForTests();
});

describe("node auth composition", () => {
  it("fails closed when required auth configuration is missing", async () => {
    delete process.env.SEMOGTW_SESSION_SECRET;
    delete process.env.SEMOGTW_OWNER_PASSWORD_HASH;
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    await expect(ensureWebAuthConfigured()).resolves.toBe(false);
    expect(getWebAuthProvider()).toBeNull();
    expect(getWebSessionSecret()).toBeNull();
    await expect(getNodeDatabase()).resolves.not.toBeNull();
  });

  it("fails closed when the configured password hash is malformed", async () => {
    process.env.SEMOGTW_SESSION_SECRET = "s".repeat(32);
    process.env.SEMOGTW_OWNER_PASSWORD_HASH = "not-a-valid-hash";
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    await expect(ensureWebAuthConfigured()).resolves.toBe(false);
    expect(getWebAuthProvider()).toBeNull();
    await expect(getNodeDatabase()).resolves.not.toBeNull();
  });

  it("configures a revocable fourteen-day local session", async () => {
    process.env.SEMOGTW_SESSION_SECRET = "s".repeat(32);
    process.env.SEMOGTW_OWNER_PASSWORD_HASH =
      "pbkdf2-sha256$310000$AQIDBAUGBwgJCgsMDQ4PEA$XIN4Q-dDSXIV3hDVJdpOvUlb3nFS3GXS-g7wNMNsdis";
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    await expect(ensureWebAuthConfigured()).resolves.toBe(true);
    expect(getWebSessionSecret()).toBe("s".repeat(32));
    await expect(getNodeDatabase()).resolves.not.toBeNull();

    const provider = getWebAuthProvider();
    expect(provider).not.toBeNull();
    if (provider === null) throw new Error("expected configured auth provider");

    const startedAt = Date.now();
    const result = await provider.authenticate({
      password: "correct horse battery staple",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected successful authentication");

    const lifetime = Date.parse(result.session.expiresAt) - startedAt;
    expect(lifetime).toBeGreaterThanOrEqual(fourteenDaysMs - 5_000);
    expect(lifetime).toBeLessThanOrEqual(fourteenDaysMs + 5_000);
  });
});
