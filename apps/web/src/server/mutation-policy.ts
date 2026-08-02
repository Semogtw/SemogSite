export type MutationAuthorizationDecision =
  | { allowed: true }
  | { allowed: false; code: "MUTATION_NOT_AUTHORIZED" };

export function decideMutationAuthorization(input: {
  ownerResolved: boolean;
  csrfValid: boolean;
}): MutationAuthorizationDecision {
  return input.ownerResolved && input.csrfValid
    ? { allowed: true }
    : { allowed: false, code: "MUTATION_NOT_AUTHORIZED" };
}
