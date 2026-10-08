import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, issueCsrfToken, type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import { privateStateWriteCapabilities } from "../src/private-capability-registry";

const owner = { id: "owner", sessionId: "session", expiresAt: "2099-01-01T00:00:00.000Z" };
const authProvider: AuthProvider = {
  authenticate: vi.fn(),
  resolveSession: vi.fn(async () => owner),
  revokeSession: vi.fn(),
};
const secret = "admin-surface-test-secret-1234567890";
const retiredPaths = [
  "/api/v1/private/overview",
  "/api/v1/private/today",
  "/api/v1/private/roadmap",
  "/api/v1/private/projects",
  "/api/v1/private/workflows",
  "/api/v1/private/cooperative-runs",
  "/api/v1/private/repository-targets",
  "/api/v1/private/branch-recommendations",
  "/api/v1/private/capabilities",
];

describe("site admin only API", () => {
  it("does not mount development orchestration reads, even for owner", async () => {
    const app = createApiApp({ authProvider });
    for (const path of retiredPaths) {
      const response = await app.request(path, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=authorized-session` },
      });
      expect(response.status, path).toBe(404);
    }
  });

  it("keeps only editorial redirect writes registered", () => {
    expect(privateStateWriteCapabilities.map((item) => item.path)).toEqual([
      "/api/v1/private/editorial-redirects/create",
      "/api/v1/private/editorial-redirects/revoke",
    ]);
  });

  it("denies a former command write even with valid owner session and CSRF", async () => {
    const csrf = await issueCsrfToken(secret, owner.sessionId);
    const app = createApiApp({ auth: { provider: authProvider, sessionSecret: secret, nodeEnv: "test" } });
    const response = await app.request("/api/v1/private/cooperative-runs/commands", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authorized-session; ${CSRF_COOKIE_NAME}=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).not.toBe(200);
  });
});
