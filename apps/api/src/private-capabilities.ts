export type PrivateRuntimeKind = "cloudflare-worker-d1" | "node-sqlite";

export type PrivateRuntimeCapabilities = {
  runtime: PrivateRuntimeKind;
  canonicalStorage: "d1" | "sqlite";
  stateWrites: readonly string[];
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

const canonicalStateWrites = [
  "attention.capture",
  "attention.transition",
  "evidence.record",
  "session_handoff.create",
  "stage.complete",
  "repository.sync_target.register",
  "repository.sync_target.change",
  "repository.active_branch.accept",
  "cooperative_run.register",
  "cooperative_run.transition",
  "verification_obligation.create",
  "verification_obligation.result",
  "verification_obligation.supersede",
  "verification_obligation.waive",
  "scope_reservation.acquire",
  "scope_reservation.renew",
  "scope_reservation.release",
  "scope_reservation.override",
  "editorial_redirect.create",
  "editorial_redirect.revoke",
] as const;

export function createPrivateRuntimeCapabilities(
  runtime: PrivateRuntimeKind,
): PrivateRuntimeCapabilities {
  return {
    runtime,
    canonicalStorage: runtime === "cloudflare-worker-d1" ? "d1" : "sqlite",
    stateWrites: canonicalStateWrites,
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
