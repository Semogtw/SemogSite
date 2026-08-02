import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@semogtw/auth";
import { createSqliteApiRuntime } from "../src/composition/sqlite";

const validHash =
  "pbkdf2-sha256$310000$AQIDBAUGBwgJCgsMDQ4PEA$XIN4Q-dDSXIV3hDVJdpOvUlb3nFS3GXS-g7wNMNsdis";

describe("SQLite API composition", () => {
  it("serves public routes and keeps private routes closed without auth", async () => {
    const runtime = createSqliteApiRuntime({
      SEMOGTW_DATABASE_URL: ":memory:",
    });

    const publicResponse = await runtime.app.request(
      "/api/v1/public/projects",
    );
    await expect(publicResponse.json()).resolves.toEqual({ ok: true, data: [] });

    const privateResponse = await runtime.app.request(
      "/api/v1/private/overview",
    );
    expect(privateResponse.status).toBe(401);
    expect(privateResponse.headers.get("cache-control")).toBe(
      "no-store, private",
    );
    runtime.close();
  });

  it("authorizes a valid local session and returns the demo overview", async () => {
    const runtime = createSqliteApiRuntime({
      NODE_ENV: "test",
      SEMOGTW_DATABASE_URL: ":memory:",
      SEMOGTW_SESSION_SECRET: "s".repeat(32),
      SEMOGTW_OWNER_PASSWORD_HASH: validHash,
    });

    expect(runtime.authProvider).not.toBeUndefined();
    const authenticated = await runtime.authProvider?.authenticate({
      password: "correct horse battery staple",
    });
    expect(authenticated?.ok).toBe(true);
    if (authenticated === undefined || !authenticated.ok) {
      throw new Error("expected authenticated API runtime");
    }

    const response = await runtime.app.request(
      "/api/v1/private/overview",
      {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${authenticated.rawToken}`,
        },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        activeProjectCount: 1,
        inProgressStageCount: 1,
      },
    });
    runtime.close();
  });
});
