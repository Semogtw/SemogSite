import { describe, expect, it, vi } from "vitest";
import { transitionPrivateAttention } from "./private-attention-commands";
import { registerPrivateCooperativeRun } from "./private-cooperative-run-commands";
import {
  createPrivateEditorialRedirect,
  revokePrivateEditorialRedirect,
} from "./private-editorial-redirect-commands";
import type { PrivateMutationClient } from "./private-mutation-client";
import {
  acceptPrivateBranchRecommendation,
  changePrivateRepositoryTarget,
  registerPrivateRepositoryTarget,
} from "./private-repository-commands";

function client() {
  const mutate = vi.fn(async () => ({ ok: true }));
  return {
    mutate,
    value: { mutate } as unknown as PrivateMutationClient,
  };
}

describe("Worker-backed DevOS command wrappers", () => {
  it("routes attention lifecycle through attention.transition", async () => {
    const { mutate, value } = client();
    const input = {
      attentionId: "attention-1",
      targetStatus: "resolved" as const,
      reason: "Resolvido.",
      confirmed: true as const,
    };

    await transitionPrivateAttention(value, input);
    expect(mutate).toHaveBeenCalledWith("attention.transition", input);
  });

  it("routes repository target registration and lifecycle through stable operations", async () => {
    const { mutate, value } = client();
    const registration = {
      projectId: "project-1",
      fullName: "Semogtw/SemogSite",
      defaultBranch: "main",
      role: "product" as const,
      reason: "Cadastrar alvo.",
      confirmed: true as const,
    };
    await registerPrivateRepositoryTarget(value, registration);
    expect(mutate).toHaveBeenLastCalledWith(
      "repository.sync_target.register",
      registration,
    );

    const lifecycle = {
      repositoryId: "repository-1",
      desiredSyncEnabled: false,
      expectedSyncEnabled: true,
      expectedUpdatedAt: "2026-08-09T20:00:00.000Z",
      reason: "Pausar sync.",
      confirmed: true as const,
    };
    await changePrivateRepositoryTarget(value, lifecycle);
    expect(mutate).toHaveBeenLastCalledWith(
      "repository.sync_target.change",
      lifecycle,
    );
  });

  it("routes branch recommendation acceptance through the canonical operation", async () => {
    const { mutate, value } = client();
    const input = {
      repositoryId: "repository-1",
      recommendationId: "recommendation-1",
      expectedActiveBranch: "main",
      reason: "Aceitar branch observada.",
      confirmed: true as const,
    };

    await acceptPrivateBranchRecommendation(value, input);
    expect(mutate).toHaveBeenCalledWith(
      "repository.active_branch.accept",
      input,
    );
  });

  it("routes cooperative run registration without implying process start", async () => {
    const { mutate, value } = client();
    const input = {
      idempotencyKey: "8f791a4d-2ad2-4bef-bb65-bd8ce8ef1833",
      projectId: "project-1",
      title: "Continuar Worker parity",
      actorLabel: "ChatGPT",
      origin: "chatgpt" as const,
      phase: "implementation",
      branch: "main",
      initialSummary: "Registro canônico.",
      nextAction: "Continuar desenvolvimento.",
      staleAfterSeconds: 1800,
      confirmed: true as const,
    };

    await registerPrivateCooperativeRun(value, input);
    expect(mutate).toHaveBeenCalledWith("cooperative_run.register", input);
  });

  it("routes editorial create/revoke through separate stable operation names", async () => {
    const { mutate, value } = client();
    const input = {
      idempotencyKey: "e1da503b-a0f2-401e-884a-fd69ec25eed0",
      sourceSlug: "old-project",
      kind: "project" as const,
      targetDocumentId: "document-1",
      reason: "Preservar URL antiga.",
      confirmed: true as const,
    };

    await createPrivateEditorialRedirect(value, input);
    expect(mutate).toHaveBeenLastCalledWith("editorial_redirect.create", input);

    await revokePrivateEditorialRedirect(value, input);
    expect(mutate).toHaveBeenLastCalledWith("editorial_redirect.revoke", input);
  });
});
