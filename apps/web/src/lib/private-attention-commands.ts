import type { PrivateMutationClient } from "./private-mutation-client";

export type AttentionLifecycleMutationInput = {
  attentionId: string;
  targetStatus: "resolved" | "dismissed";
  reason: string;
  confirmed: true;
};

export type AttentionLifecycleMutationResult = {
  attentionId: string;
  status: "resolved" | "dismissed";
};

export function transitionPrivateAttention(
  client: PrivateMutationClient,
  input: AttentionLifecycleMutationInput,
): Promise<AttentionLifecycleMutationResult> {
  return client.mutate<AttentionLifecycleMutationResult>(
    "attention.transition",
    input,
  );
}
