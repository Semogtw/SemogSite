import { describe, expect, it, vi } from "vitest";
import {
  PrivateApiError,
  executePrivateRead,
  executePrivateStateWrite,
  findPrivateStateWriteCapability,
  loadPrivateRuntimeCapabilities,
  type PrivateRuntimeCapabilities,
} from "./private-api-client";

const capabilities: PrivateRuntimeCapabilities = {
  runtime: "cloudflare-worker-d1",
  canonicalStorage: "d1",
  stateWrites: ["stage.complete", "cooperative_run.transition"],
  stateWriteEndpoints: [
    {
      name: "stage.complete",
      method: "POST",
      path: "/api/v1/private/stages/complete",
      externalEffect: false,
      retrySemantics: "optimistic-concurrency",
    },
    {
      name: "cooperative_run.transition",
      method: "POST",
      path: "/api/v1/private/cooperative-runs/transition",
      externalEffect: false,
      retrySemantics: "semantic-idempotency",
    },
  ],
  externalEffects: {
    repositoryCheckout: false,
    repositoryFetch: false,
    repositoryPush: false,
    commandExecution: false,
    processControl: false,
  },
  semantics: {
    ownerSessionRequired: true,
    sameOriginRequired: true,
    csrfRequiredForMutations: true,
    auditLedger: true,
    optimisticConcurrency: true,
    semanticIdempotency: true,
  },
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
}

describe("private API client", () => {
  it("reads canonical private data without CSRF and disables fetch caching", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ ok: true, data: { runs: [] } }),
    );

    await expect(
      executePrivateRead<{ runs: unknown[] }>(
        "/api/v1/private/cooperative-runs?limit=10",
        fetchImpl,
      ),
    ).resolves.toEqual({ runs: [] });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/private/cooperative-runs?limit=10",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "x-csrf-token",
    );
  });

  it("loads and validates the capability registry from same origin", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: capabilities }),
    );

    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).resolves.toEqual(capabilities);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/private/capabilities",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("rejects a capability document that unexpectedly advertises external effects", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        data: {
          ...capabilities,
          externalEffects: { ...capabilities.externalEffects, commandExecution: true },
        },
      }),
    );

    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "unexpectedly advertises external effects",
    );
  });

  it("resolves a state write by stable operation name", () => {
    expect(findPrivateStateWriteCapability(capabilities, "stage.complete")).toMatchObject({
      path: "/api/v1/private/stages/complete",
      retrySemantics: "optimistic-concurrency",
    });
    expect(() => findPrivateStateWriteCapability(capabilities, "repository.push")).toThrow(
      "Private operation is not available",
    );
  });

  it("executes a registered write with CSRF and validates operation metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { ok: true, data: { stageId: "stage-1" } },
        {
          headers: {
            "x-semogtw-operation": "stage.complete",
            "x-semogtw-retry-semantics": "optimistic-concurrency",
          },
        },
      ),
    );

    await expect(
      executePrivateStateWrite<{ stageId: string }>({
        capabilities,
        operation: "stage.complete",
        payload: { stageId: "stage-1", reason: "Gate validado.", confirmed: true },
        csrfToken: "csrf-token",
        fetchImpl,
      }),
    ).resolves.toEqual({ stageId: "stage-1" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/private/stages/complete",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": "csrf-token",
        }),
      }),
    );
  });

  it("rejects response metadata that disagrees with the capability registry", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { ok: true, data: { stageId: "stage-1" } },
        {
          headers: {
            "x-semogtw-operation": "attention.capture",
            "x-semogtw-retry-semantics": "atomic-create",
          },
        },
      ),
    );

    await expect(
      executePrivateStateWrite({
        capabilities,
        operation: "stage.complete",
        payload: {},
        csrfToken: "csrf-token",
        fetchImpl,
      }),
    ).rejects.toThrow("operation metadata does not match capabilities");
  });

  it("turns a canonical API error into a typed PrivateApiError", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          ok: false,
          error: {
            code: "CONFLICT",
            message: "O estado mudou.",
            correlationId: "correlation-1",
          },
        },
        {
          status: 409,
          headers: {
            "x-semogtw-operation": "stage.complete",
            "x-semogtw-retry-semantics": "optimistic-concurrency",
          },
        },
      ),
    );

    const error = await executePrivateStateWrite({
      capabilities,
      operation: "stage.complete",
      payload: {},
      csrfToken: "csrf-token",
      fetchImpl,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(PrivateApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      correlationId: "correlation-1",
    });
  });
});
