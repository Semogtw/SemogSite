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

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetWebAuthForTests();
  resetNodeAuthCompositionForTests();
});

describe("node auth composition", () => {
  it("fails closed when required configuration is missing", async () => {
    delete process.env.SEMOGTW_SESSION_SECRET;
    delete process.env.SEMOGTW_OWNER_PASSWORD_HASH;
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    await expect(ensureWebAuthConfigured()).resolves.toBe(false);
    expect(getWebAuthProvider()).toBeNull();
    expect(getWebSessionSecret()).toBeNull();
  });

  it("configures the provider and secret from the local runtime", async () => {
    process.env.SEMOGTW_SESSION_SECRET = "s".repeat(32);
    process.env.SEMOGTW_OWNER_PASSWORD_HASH =
      "pbkdf2_sha256$210000$dGVzdC1zYWx0$0evN7aRhEyVdT8+qN/98kUsRZoU7wE8uI5eTfg4+nbQ=";
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    await expect(ensureWebAuthConfigured()).resolves.toBe(true);
    expect(getWebAuthProvider()).not.toBeNull();
    expect(getWebSessionSecret()).toBe("s".repeat(32));
  });
});
