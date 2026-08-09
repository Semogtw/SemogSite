import { describe, expect, it, vi } from "vitest";
import { createPrivateDevosClient } from "./private-devos-client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
}

const capability = {
  name: "verification_obligation.result",
  method: "POST" as const,
  path: "/api/v1/private/verification-obligations/result" as const,
  externalEffect: false as const,
  retrySemantics: "semantic-idempotency" as const,
};
const capabilities = {
  runtime: "cloudflare-worker-d1" as const,
  canonicalStorage: "d1" as const,
  stateWrites: [capability.name],
  stateWriteEndpoints: [capability],
  externalEffects: {
    repositoryCheckout: false as const,
    repositoryFetch: false as const,
    repositoryPush: false as const,
    commandExecution: false as const,
    processControl: false as const,
  },
};

describe("generic private DevOS operations", () => {
  it("uses the same registered transport for operations without a typed wrapper", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: capabilities }))
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: true, data: { obligationId: "obligation-1" } },
          {
            headers: {
              "x-semogtw-operation": capability.name,
              "x-semogtw-retry-semantics": capability.retrySemantics,
            },
          },
        ),
      );
    const client = createPrivateDevosClient({
      fetchImpl,
      getCsrfToken: () => "csrf-token",
    });
    const payload = {
      idempotencyKey: "395cb49c-45c8-4f89-b51d-90ecc810cc48",
      obligationId: "obligation-1",
      result: "passed",
    };

    await expect(
      client.mutate<{ obligationId: string }>(capability.name, payload),
    ).resolves.toEqual({ obligationId: "obligation-1" });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(capability.path);
  });

  it("derives UI retry behavior from the downloaded per-operation contract", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: capabilities }),
    );
    const client = createPrivateDevosClient({
      fetchImpl,
      getCsrfToken: () => "csrf-token",
    });

    await expect(client.getRetryPolicy(capability.name)).resolves.toEqual({
      action: "retry-exact-intent",
      automaticTransportRetry: true,
      requiresFreshRead: false,
      preservesRetryKey: true,
    });
  });
});
