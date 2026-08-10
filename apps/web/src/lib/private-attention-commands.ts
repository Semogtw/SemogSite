import type { PrivateMutationClient } from "./private-mutation-client";

export type AttentionType =
  | "blocker"
  | "risk"
  | "decision"
  | "external_dependency"
  | "critical_test";

export type AttentionImpact = "high" | "medium" | "low";

export type AttentionCaptureMutationInput = {
  type: AttentionType;
  impact: AttentionImpact;
  title: string;
  nextAction: string;
  reason: string;
  confirmed: true;
};

export type AttentionCaptureMutationResult = {
  attentionId: string;
};

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

export function capturePrivateAttention(
  client: PrivateMutationClient,
  input: AttentionCaptureMutationInput,
): Promise<AttentionCaptureMutationResult> {
  return client.mutate<AttentionCaptureMutationResult>(
    "attention.capture",
    input,
  );
}

export function transitionPrivateAttention(
  client: PrivateMutationClient,
  input: AttentionLifecycleMutationInput,
): Promise<AttentionLifecycleMutationResult> {
  return client.mutate<AttentionLifecycleMutationResult>(
    "attention.transition",
    input,
  );
}
