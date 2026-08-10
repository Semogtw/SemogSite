import {
  privateStateWriteCapabilities,
  type PrivateStateWriteCapability,
} from "./private-capability-registry";

export type PrivateRuntimeKind = "cloudflare-worker-d1" | "node-sqlite";

export type PrivateRuntimeCapabilities = {
  runtime: PrivateRuntimeKind;
  canonicalStorage: "d1" | "sqlite";
  stateWrites: readonly string[];
  stateWriteEndpoints: readonly PrivateStateWriteCapability[];
  externalEffects: {
    repositoryCheckout: false;
    repositoryFetch: false;
    repositoryPush: false;
    commandExecution: false;
    processControl: false;
  };
  semantics: {
    ownerSessionRequired: true;
    sameOriginRequired: true;
    csrfRequiredForMutations: true;
    auditLedger: true;
    optimisticConcurrency: true;
    semanticIdempotency: true;
  };
};

export function createPrivateRuntimeCapabilities(
  runtime: PrivateRuntimeKind,
): PrivateRuntimeCapabilities {
  return {
    runtime,
    canonicalStorage: runtime === "cloudflare-worker-d1" ? "d1" : "sqlite",
    stateWrites: privateStateWriteCapabilities.map((capability) => capability.name),
    stateWriteEndpoints: privateStateWriteCapabilities,
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
