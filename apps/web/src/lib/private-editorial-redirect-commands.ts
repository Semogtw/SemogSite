import type { PrivateMutationClient } from "./private-mutation-client";

export type EditorialDocumentKind =
  | "project"
  | "note"
  | "experiment"
  | "page";

export type EditorialRedirectMutationInput = {
  idempotencyKey: string;
  sourceSlug: string;
  kind: EditorialDocumentKind;
  targetDocumentId: string;
  reason: string;
  confirmed: true;
};

export type EditorialRedirectEventResult = {
  id: string;
  sourceSlug: string;
  kind: EditorialDocumentKind;
  targetDocumentId: string;
  sequence: number;
  action: "created" | "revoked";
  actor: string;
  reason: string;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EditorialRedirectMutationResult = {
  event: EditorialRedirectEventResult;
  duplicate: boolean;
};

export function createPrivateEditorialRedirect(
  client: PrivateMutationClient,
  input: EditorialRedirectMutationInput,
): Promise<EditorialRedirectMutationResult> {
  return client.mutate<EditorialRedirectMutationResult>(
    "editorial_redirect.create",
    input,
  );
}

export function revokePrivateEditorialRedirect(
  client: PrivateMutationClient,
  input: EditorialRedirectMutationInput,
): Promise<EditorialRedirectMutationResult> {
  return client.mutate<EditorialRedirectMutationResult>(
    "editorial_redirect.revoke",
    input,
  );
}
