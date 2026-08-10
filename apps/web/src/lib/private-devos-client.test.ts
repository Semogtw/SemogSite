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

const capabilities = {
  runtime: "cloudflare-worker-d1",
  canonicalStorage: "d1",
  stateWrites: ["stage.complete", "editorial_redirect.create"],
  stateWriteEndpoints: [
    {
      name: "stage.complete",
      method: "POST",
      path: "/api/v1/private/stages/complete",
      externalEffect: false,
      retrySemantics: "optimistic-concurrency",
    },
    {
      name: "editorial_redirect.create",
      method: "POST",
      path: "/api/v1/private/editorial-redirects/create",
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

describe("createPrivateDevosClient", () => {
  it("composes typed Stage Completion over capability discovery and CSRF", async () => {
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
      );
    const client = createPrivateDevosClient({
      fetchImpl,
      getCsrfToken: () => "csrf-token",
    });

    await expect(
      client.stages.complete({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    ).resolves.toEqual({ stageId: "stage-1" });

    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "/api/v1/private/stages/complete",
    );
  });

  it("reuses the same capability cache across separate domain command groups", async () => {
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
          {
            ok: true,
            data: {
              event: {
                id: "redirect-event-1",
                sourceSlug: "old-project",
                kind: "project",
                targetDocumentId: "document-1",
                sequence: 1,
                action: "created",
                actor: "semogtw-owner",
                reason: "Preservar URL antiga.",
                occurredAt: "2026-08-09T21:00:00.000Z",
                idempotencyKey: "redirect-create-1",
                correlationId: "correlation-1",
              },
              duplicate: false,
            },
          },
          {
            headers: {
              "x-semogtw-operation": "editorial_redirect.create",
              "x-semogtw-retry-semantics": "semantic-idempotency",
            },
          },
        ),
      );
    const client = createPrivateDevosClient({
      fetchImpl,
      getCsrfToken: () => "csrf-token",
    });

    await client.stages.complete({
      stageId: "stage-1",
      reason: "Gate validado.",
      confirmed: true,
    });
    await client.editorial.createRedirect({
      idempotencyKey: "08cc62c8-6ca8-4b7c-a56c-76ab4ea6c138",
      sourceSlug: "old-project",
      kind: "project",
      targetDocumentId: "document-1",
      reason: "Preservar URL antiga.",
      confirmed: true,
    });

    expect(
      fetchImpl.mock.calls.filter(
        ([url]) => url === "/api/v1/private/capabilities",
      ),
    ).toHaveLength(1);
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      "/api/v1/private/editorial-redirects/create",
    );
  });
});
