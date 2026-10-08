export type PrivateRetrySemantics =
  | "atomic-create"
  | "deduplicated-state"
  | "optimistic-concurrency"
  | "semantic-idempotency";

export type PrivateStateWriteCapability = {
  name: string;
  method: "POST";
  path: `/api/v1/private/${string}`;
  externalEffect: false;
  retrySemantics: PrivateRetrySemantics;
};

/**
 * Only site editorial operations can be mutated through the private API.
 * An authenticated owner is not a license to invoke the retired orchestration.
 * Human editorial writes handled by TanStack server functions retain their
 * separate owner + CSRF + publication workflow.
 */
export const privateStateWriteCapabilities = [
  {
    name: "editorial_redirect.create",
    method: "POST",
    path: "/api/v1/private/editorial-redirects/create",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "editorial_redirect.revoke",
    method: "POST",
    path: "/api/v1/private/editorial-redirects/revoke",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
] as const satisfies readonly PrivateStateWriteCapability[];
