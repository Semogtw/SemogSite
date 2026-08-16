import { describe, expect, it, vi } from "vitest";
import {
  PrivateAuthError,
  getPrivateAuthSession,
  getPrivateOwner,
  loginPrivateOwner,
  logoutPrivateOwner,
} from "./private-auth-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("private auth browser client", () => {
  it("reads the owner session with same-origin credentials and no cache", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        ok: true,
        data: {
          authenticated: true,
          owner: { id: "owner", expiresAt: "2026-08-20T00:00:00.000Z" },
        },
      }),
    );

    await expect(getPrivateOwner(fetchImpl)).resolves.toEqual({
      id: "owner",
      expiresAt: "2026-08-20T00:00:00.000Z",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/auth/session",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });

  it("returns an explicit unauthenticated session without inventing an owner", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ ok: true, data: { authenticated: false } }),
    );
    await expect(getPrivateAuthSession(fetchImpl)).resolves.toEqual({
      authenticated: false,
    });
    await expect(getPrivateOwner(fetchImpl)).resolves.toBeNull();
  });

  it("posts login JSON and lets the API own session cookies", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ ok: true, data: { expiresAt: "2026-08-20T00:00:00.000Z" } }),
    );
    await expect(loginPrivateOwner("secret", fetchImpl)).resolves.toMatchObject({
      expiresAt: "2026-08-20T00:00:00.000Z",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ password: "secret" }),
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
  });

  it("sends the browser CSRF token only on logout", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ ok: true, data: { revoked: true } }),
    );
    await expect(logoutPrivateOwner("csrf", fetchImpl)).resolves.toEqual({
      revoked: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf" }),
      }),
    );
  });

  it("preserves canonical auth errors as typed failures", async () => {
    const fetchImpl = vi.fn(async () =>
      response(
        {
          ok: false,
          error: { code: "RATE_LIMITED", message: "Não foi possível autenticar." },
        },
        429,
      ),
    );
    const error = await loginPrivateOwner("secret", fetchImpl).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(PrivateAuthError);
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});
