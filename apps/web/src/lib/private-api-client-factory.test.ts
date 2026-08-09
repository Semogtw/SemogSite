import { describe, expect, it, vi } from "vitest";
import {
  createPrivateApiClient,
  type PrivateRuntimeCapabilities,
} from "./private-api-client";

const capabilities: PrivateRuntimeCapabilities = {
  runtime: "cloudflare-worker-d1",
  canonicalStorage: "d1",
  stateWrites: ["stage.complete"],
  stateWriteEndpoints: [
    {
      name: "stage.complete",
      method: "POST",
      path: "/api/v1/private/stages/complete",
      externalEffect: false,
      retrySemantics: "optimistic-concurrency",
    },
  ],
  externalEffects: {
    repositoryCheckout: false,
    repositoryFetch: false,
    repositoryPush: false,
    commandExecution: false,
    processControl: false,
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

function capabilityResponse(value: PrivateRuntimeCapabilities = capabilities) {
  return jsonResponse({ ok: true, data: value });
}

function mutationResponse() {
  return jsonResponse(
    { ok: true, data: { stageId: "stage-1" } },
    {
      headers: {
        "x-semogtw-operation": "stage.complete",
        "x-semogtw-retry-semantics": "optimistic-concurrency",
      },
    },
  );
}

describe("createPrivateApiClient", () => {
  it("caches capabilities while requesting CSRF for every mutation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(mutationResponse())
      .mockResolvedValueOnce(mutationResponse());
    const getCsrfToken = vi
      .fn()
      .mockResolvedValueOnce("csrf-1")
      .mockResolvedValueOnce("csrf-2");
    const client = createPrivateApiClient({ fetchImpl, getCsrfToken });

    await expect(
      client.mutate("stage.complete", {
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    ).resolves.toEqual({ stageId: "stage-1" });
    await expect(
      client.mutate("stage.complete", {
        stageId: "stage-1",
        reason: "Gate validado novamente.",
        confirmed: true,
      }),
    ).resolves.toEqual({ stageId: "stage-1" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/private/capabilities");
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-csrf-token": "csrf-1" }),
    });
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-csrf-token": "csrf-2" }),
    });
    expect(getCsrfToken).toHaveBeenCalledTimes(2);
  });

  it("drops a failed capability load so the next request can recover", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(capabilityResponse());
    const client = createPrivateApiClient({
      fetchImpl,
      getCsrfToken: () => "csrf",
    });

    await expect(client.getCapabilities()).rejects.toThrow("temporary network failure");
    await expect(client.getCapabilities()).resolves.toEqual(capabilities);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("forces one capability refresh when a requested operation is absent", async () => {
    const empty: PrivateRuntimeCapabilities = {
      ...capabilities,
      stateWrites: [],
      stateWriteEndpoints: [],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse(empty))
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(mutationResponse());
    const client = createPrivateApiClient({
      fetchImpl,
      getCsrfToken: () => "csrf",
    });

    await expect(client.mutate("stage.complete", {})).resolves.toEqual({
      stageId: "stage-1",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/private/capabilities");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/api/v1/private/capabilities");
    expect(fetchImpl.mock.calls[2]?.[0]).toBe("/api/v1/private/stages/complete");
  });

  it("refuses to send a mutation when CSRF provider returns an empty token", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(capabilityResponse());
    const client = createPrivateApiClient({
      fetchImpl,
      getCsrfToken: () => "   ",
    });

    await expect(client.mutate("stage.complete", {})).rejects.toThrow(
      "requires a CSRF token",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("allows callers to invalidate cached capabilities explicitly", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(capabilityResponse());
    const client = createPrivateApiClient({
      fetchImpl,
      getCsrfToken: () => "csrf",
    });

    await client.getCapabilities();
    client.clearCapabilities();
    await client.getCapabilities();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
