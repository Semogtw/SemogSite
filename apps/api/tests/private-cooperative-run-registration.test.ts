import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  CooperativeRunRegistrationService,
  type CooperativeRunRegistrationRepository,
  type CooperativeRunSnapshot,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "cooperative-run-secret-1234567890";
const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-run-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-run-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const register = vi.fn<CooperativeRunRegistrationRepository["register"]>();
const repository: CooperativeRunRegistrationRepository = { register };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRuns: new CooperativeRunRegistrationService(repository),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-run-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const retryKey = "9f13bd06-a377-40e3-bfd3-f4895d03eb12";
const body = {
  idempotencyKey: retryKey,
  projectId: "project-1",
  title: " Portar writes D1 ",
  actorLabel: " ChatGPT ",
  origin: "chatgpt" as const,
  phase: " worker-parity ",
  branch: " main ",
  initialSummary: " Registro iniciado. ",
  nextAction: " Continuar a implementação. ",
  staleAfterSeconds: 1800,
  confirmed: true as const,
};

beforeEach(() => {
  register.mockReset();
  register.mockResolvedValue("created");
});

describe("private cooperative run registration", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/cooperative-runs/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/cooperative-runs/register",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=cooperative-run-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(register).not.toHaveBeenCalled();
  });

  it("uses retry-stable identities and never claims to start a process", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/register",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runId: `cooperative-run-${retryKey}`,
        status: "running",
        processStarted: false,
      },
    });

    const [run, event] = register.mock.calls[0] ?? [];
    expect(run).toMatchObject({
      id: `cooperative-run-${retryKey}`,
      projectId: "project-1",
      title: "Portar writes D1",
      actorLabel: "ChatGPT",
      phase: "worker-parity",
      branch: "main",
      progress: 0,
      status: "running",
    } satisfies Partial<CooperativeRunSnapshot>);
    expect(event).toMatchObject({
      id: `run-event-registration-${retryKey}`,
      runId: `cooperative-run-${retryKey}`,
      actor: owner.id,
      idempotencyKey: `run-registration-${retryKey}`,
      correlationId: `correlation-run-registration-${retryKey}`,
    });
  });

  it("maps semantic replay and missing project without false creation", async () => {
    register.mockResolvedValueOnce("duplicate");
    const replay = await app().request(
      "/api/v1/private/cooperative-runs/register",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE" },
    });

    register.mockResolvedValueOnce("project_not_found");
    const missing = await app().request(
      "/api/v1/private/cooperative-runs/register",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });
  });
});
