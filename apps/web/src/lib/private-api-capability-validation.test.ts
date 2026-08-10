import { describe, expect, it, vi } from "vitest";
import { loadPrivateRuntimeCapabilities } from "./private-api-client";

const stage = {
  name: "stage.complete",
  method: "POST",
  path: "/api/v1/private/stages/complete",
  externalEffect: false,
  retrySemantics: "optimistic-concurrency",
};

function response(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function base() {
  return {
    runtime: "cloudflare-worker-d1",
    canonicalStorage: "d1",
    stateWrites: [stage.name],
    stateWriteEndpoints: [stage],
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
}

describe("private API capability validation", () => {
  it("rejects inconsistent runtime and canonical storage", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ ...base(), canonicalStorage: "sqlite" }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "runtime/storage pair is inconsistent",
    );
  });

  it("rejects duplicate operation names", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        ...base(),
        stateWrites: [stage.name, stage.name],
        stateWriteEndpoints: [
          stage,
          { ...stage, path: "/api/v1/private/stages/other" },
        ],
      }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "registry contains duplicates",
    );
  });

  it("rejects duplicate operation paths", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        ...base(),
        stateWrites: [stage.name, "stage.other"],
        stateWriteEndpoints: [stage, { ...stage, name: "stage.other" }],
      }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "registry contains duplicates",
    );
  });

  it("rejects registry ordering/names that do not match stateWrites", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ ...base(), stateWrites: ["stage.other"] }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "names do not match endpoint registry",
    );
  });

  it("rejects non-canonical trailing-slash mutation paths", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        ...base(),
        stateWriteEndpoints: [
          { ...stage, path: "/api/v1/private/stages/complete/" },
        ],
      }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "Invalid private capability endpoint entry",
    );
  });

  it("rejects a runtime that weakens required private security semantics", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        ...base(),
        semantics: {
          ...base().semantics,
          csrfRequiredForMutations: false,
        },
      }),
    );
    await expect(loadPrivateRuntimeCapabilities(fetchImpl)).rejects.toThrow(
      "security semantics are weaker than required",
    );
  });
});
