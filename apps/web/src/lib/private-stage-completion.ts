export type StageCompletionMutationInput = {
  stageId: string;
  reason: string;
  confirmed: true;
};

export type StageCompletionMutationResult = {
  stageId: string;
};

export interface PrivateMutationClient {
  mutate<T>(operation: string, payload: unknown): Promise<T>;
}

/**
 * Browser-side command wrapper for the canonical Worker/private API route.
 * Domain validation, evidence requirements, CAS and audit remain server-side.
 */
export function completePrivateStage(
  client: PrivateMutationClient,
  input: StageCompletionMutationInput,
): Promise<StageCompletionMutationResult> {
  return client.mutate<StageCompletionMutationResult>("stage.complete", input);
}
