import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunCommandQueueCommands } from "../src/routes/private/cooperative-run-commands";

const sessionSecret = "cooperative-command-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-command-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-command-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const queue = vi.fn<PrivateCooperativeRunCommandQueueCommands["queue"]>(async () => ({
  ok: true as const,
  command: {
    id: "run-command-1",
    runId: "cooperative-run-1",
    kind: "request_checkpoint" as const,
    status: "queued" as const,
    summary: "Envie um checkpoint.",
    payload: { include: ["commits", "tests"] },
    reason: null,
    queuedBy: owner.id,
    idempotencyKey: "owner-command-key",
    correlationId: "correlation-owner-command-key",
    queuedAt: "2026-08-11T10:30:00.000Z",
    acknowledgedAt: null,
    completedAt: null,
    expiresAt: null,
    updatedAt: "2026-08-11T10:30:00.000Z",
  },
  event: {} as never,
}));

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRunCommands: { queue },
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-command-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const idempotencyKey = "6939a2b8-bb38-4dd9-b35a-856055533ab6";
const command = {
  idempotencyKey,
  runId: "cooperative-run-1",
  kind: "request_checkpoint" as const,
  summary: "Envie um checkpoint.",
  expiresAt: null,
  include: ["commits", "tests"] as const,
  confirmed: true as const,
};

beforeEach(() => queue.mockClear());

describe("private cooperative run command queue", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/cooperative-runs/commands",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/cooperative-runs/commands",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=cooperative-command-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(command),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(queue).not.toHaveBeenCalled();
  });

  it("queues canonical intent without claiming delivery or process control", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/commands",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(command),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        commandId: "run-command-1",
        status: "queued",
        delivered: false,
        processControlTriggered: false,
      },
    });
    const [input, context] = queue.mock.calls[0] ?? [];
    expect(input).toEqual({
      runId: command.runId,
      kind: command.kind,
      summary: command.summary,
      payload: { include: ["commits", "tests"] },
      expiresAt: null,
    });
    expect(context).toMatchObject({
      actorId: owner.id,
      commandId: `run-command-${idempotencyKey}`,
      eventId: `run-event-owner-command-${idempotencyKey}`,
      idempotencyKey: `owner-command-${idempotencyKey}`,
      correlationId: `correlation-owner-command-${idempotencyKey}`,
      source: "manual",
    });
  });

  it("maps validation and terminal-state failures", async () => {
    queue.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["PAYLOAD_FIELD_INVALID"],
    });
    const invalid = await app().request(
      "/api/v1/private/cooperative-runs/commands",
      { method: "POST", headers: await headers(), body: JSON.stringify(command) },
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["PAYLOAD_FIELD_INVALID"] },
    });

    queue.mockResolvedValueOnce({ ok: false, code: "TERMINAL_RUN" });
    const terminal = await app().request(
      "/api/v1/private/cooperative-runs/commands",
      { method: "POST", headers: await headers(), body: JSON.stringify(command) },
    );
    expect(terminal.status).toBe(409);
    await expect(terminal.json()).resolves.toMatchObject({
      error: { code: "TERMINAL_RUN" },
    });
  });
});
