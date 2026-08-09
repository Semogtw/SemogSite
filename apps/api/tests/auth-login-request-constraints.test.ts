import type { AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async () => null),
  revokeSession: vi.fn(async () => undefined),
};

function configuredApp() {
  return createApiApp({
    auth: {
      provider: authProvider,
      sessionSecret: "s".repeat(32),
      nodeEnv: "test",
    },
  });
}

describe("login request constraints", () => {
  it("rejects request bodies larger than 4 KiB before authentication", async () => {
    const response = await configuredApp().request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(5 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Não foi possível autenticar.",
      },
    });
    expect(authProvider.authenticate).not.toHaveBeenCalled();
  });

  it("rejects missing or non-JSON content types", async () => {
    for (const headers of [{}, { "content-type": "text/plain" }]) {
      const response = await configuredApp().request("/api/v1/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "secret" }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_REQUEST" },
      });
    }
    expect(authProvider.authenticate).not.toHaveBeenCalled();
  });

  it("accepts structured JSON media types before credential validation", async () => {
    const response = await configuredApp().request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/vnd.semogtw.auth+json; charset=utf-8" },
      body: JSON.stringify({ password: "wrong" }),
    });

    expect(response.status).toBe(401);
  });
});
