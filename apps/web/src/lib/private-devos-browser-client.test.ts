import { describe, expect, it, vi } from "vitest";
import { createPrivateDevosBrowserClient } from "./private-devos-browser-client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
}

const capabilities = {
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

describe("createPrivateDevosBrowserClient", () => {
  it("reads the caller-owned CSRF cookie lazily for a mutation", async () => {
    let cookieSource = "csrf_name=csrf-1";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: capabilities }))
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: true, data: { stageId: "stage-1" } },
          {
            headers: {
              "x-semogtw-operation": "stage.complete",
              "x-semogtw-retry-semantics": "optimistic-concurrency",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
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
    const client = createPrivateDevosBrowserClient({
      csrfCookieName: "csrf_name",
      readCookieSource: () => cookieSource,
      fetchImpl,
    });

    await client.stages.complete({
      stageId: "stage-1",
      reason: "Primeiro gate.",
      confirmed: true,
    });
    cookieSource = "csrf_name=csrf-2";
    await client.stages.complete({
      stageId: "stage-1",
      reason: "Segundo gate.",
      confirmed: true,
    });

    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-csrf-token": "csrf-1" }),
    });
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-csrf-token": "csrf-2" }),
    });
  });

  it("never uses a similarly prefixed cookie as the CSRF value", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: capabilities }));
    const client = createPrivateDevosBrowserClient({
      csrfCookieName: "csrf",
      readCookieSource: () => "csrf_old=wrong; session=abc",
      fetchImpl,
    });

    await expect(
      client.stages.complete({
        stageId: "stage-1",
        reason: "Gate.",
        confirmed: true,
      }),
    ).rejects.toThrow("requires a CSRF token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
