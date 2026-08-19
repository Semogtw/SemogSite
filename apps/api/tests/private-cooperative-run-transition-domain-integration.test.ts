import { describe, expect, it, vi } from "vitest";
import type {
  CooperativeRunEvent,
  CooperativeRunSnapshot,
  CooperativeRunTransitionRepository,
} from "@semogtw/domain/runs";
import { createApiApp } from "../src/app";
import { createTestAuth } from "./support/auth";

const owner = {
  id: "semogtw-owner",
  username: "semogtw",
} as const;

const initial: CooperativeRunSnapshot = {
  id: "cooperative-run-domain-1",
  projectId: "project-1",
  repositoryId: "repository-1",
  branch: "main",
  state: "running",
  progress: 25,
  phase: "implementation",
  summary: "Implementação em andamento.",
  blockers: [],
  nextAction: "Continuar implementação.",
  source: "manual",
  startedAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:30:00.000Z",
  completedAt: null,
  pausedAt: null,
  cancelledAt: null,
  failedAt: null,
  version: 2,
};

const apply = vi.fn<CooperativeRunTransitionRepository["apply"]>();

function repository(): CooperativeRunTransitionRepository {
  return {
    findById: vi.fn(async (id) => (id === initial.id ? initial : null)),
    apply,
  };
}

function app() {
  apply.mockReset();
  apply.mockImplementation(
    async (
      before: CooperativeRunSnapshot,
      after: CooperativeRunSnapshot,
      _event: CooperativeRunEvent,
    ) => ({
      status: "applied",
      before,
      after,
    }),
  );
  const auth = createTestAuth(owner);
  return createApiApp({
    auth,
    cooperativeRunTransitionRepository: repository(),
  });
}

async function headers() {
  const auth = createTestAuth(owner);
  return auth.authenticatedMutationHeaders();
}

describe("cooperative run route/domain integration", () => {
  it("passes terminal transition through the domain service", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: "7f27b89f-ad11-4533-a98b-b4dd215ddbc4",
          runId: initial.id,
          expectedUpdatedAt: initial.updatedAt,
          kind: "complete",
          progress: 100,
          summary: "Implementação concluída.",
          phase: "done",
          branch: "main",
          nextAction: "Nenhuma.",
          confirmed: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(apply).toHaveBeenCalledTimes(1);
    const [before, after, event] = apply.mock.calls[0] ?? [];
    expect(before).toEqual(initial);
    expect(after).toMatchObject({
      state: "completed",
      progress: 100,
      summary: "Implementação concluída.",
    });
    expect(event).toMatchObject({
      runId: initial.id,
      actor: owner.id,
      kind: "run.completed",
    });
  });

  it("passes monotonic progress through the canonical checkpoint command", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: "750b075a-ac3f-4070-9c42-bd99950b4e20",
          runId: initial.id,
          expectedUpdatedAt: initial.updatedAt,
          kind: "checkpoint",
          progress: 60,
          summary: "Integração validada.",
          phase: "validation",
          branch: "main",
          nextAction: "Rodar gate.",
          confirmed: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(apply).toHaveBeenCalledTimes(1);
    const [, after, event] = apply.mock.calls[0] ?? [];
    expect(after).toMatchObject({
      progress: 60,
      summary: "Integração validada.",
      nextAction: "Rodar gate.",
    });
    expect(event).toMatchObject({
      runId: initial.id,
      actor: owner.id,
      kind: "run.checkpoint",
    });
  });
});
