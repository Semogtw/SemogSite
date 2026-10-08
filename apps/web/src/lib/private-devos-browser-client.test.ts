import { describe, expect, it, vi } from "vitest";
import { createPrivateDevosBrowserClient } from "./private-devos-browser-client";

function response(data: unknown, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}
const descriptor = {
  name: "editorial_redirect.create",
  method: "POST",
  path: "/api/v1/private/editorial-redirects/create",
  externalEffect: false,
  retrySemantics: "semantic-idempotency",
};
const capabilities = {
  runtime: "node-sqlite",
  canonicalStorage: "sqlite",
  stateWrites: [descriptor.name],
  stateWriteEndpoints: [descriptor],
  externalEffects: {
    repositoryCheckout: false, repositoryFetch: false, repositoryPush: false,
    commandExecution: false, processControl: false,
  },
  semantics: {
    ownerSessionRequired: true, sameOriginRequired: true,
    csrfRequiredForMutations: true, auditLedger: true,
    optimisticConcurrency: true, semanticIdempotency: true,
  },
};

describe("editorial administration browser client", () => {
  it("sends an editorial mutation with the live CSRF cookie", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(capabilities))
      .mockResolvedValueOnce(response({ event: { id: "1" }, duplicate: false }, {
        "x-semogtw-operation": descriptor.name,
        "x-semogtw-retry-semantics": descriptor.retrySemantics,
      }));
    const client = createPrivateDevosBrowserClient({
      csrfCookieName: "csrf", readCookieSource: () => "csrf=current-token",
      fetchImpl,
    });
    await client.editorial.createRedirect({
      idempotencyKey: "74e10132-5493-4a02-8c3d-e483d858d330",
      sourceSlug: "old-url", kind: "project", targetDocumentId: "doc",
      reason: "Canonical", confirmed: true,
    });
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({
      "x-csrf-token": "current-token",
    });
  });

  it("rejects operational writes before network activity", async () => {
    const fetchImpl = vi.fn();
    const client = createPrivateDevosBrowserClient({
      csrfCookieName: "csrf", readCookieSource: () => "csrf=current-token",
      fetchImpl,
    });
    await expect(client.mutate("cooperative_run.register", {}))
      .rejects.toThrow("Only editorial mutations");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
