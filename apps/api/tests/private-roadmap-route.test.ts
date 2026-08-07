import { type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async () => ({
    id: "semogtw-owner",
    sessionId: "session-roadmap",
    expiresAt: "2026-08-20T00:00:00.000Z",
  })),
  revokeSession: vi.fn(async () => undefined),
};

describe("private Roadmap route", () => {
  it("serves the complete roadmap board behind private authentication", async () => {
    const privateRoadmap = {
      getRoadmap: vi.fn(async () => ({
        items: [
          {
            id: "stage-a",
            projectId: "project-a",
            projectName: "Projeto A",
            title: "Integrar Roadmap D1",
            area: "integration" as const,
            state: "in_progress" as const,
            progress: 75,
            orderIndex: 1,
            currentPosition: "Adapter pronto",
            nextStep: "Expor rota",
            blocker: null,
            updatedAt: "2026-08-07T22:00:00.000Z",
          },
        ],
        board: {
          backlog: [],
          next: [],
          in_progress: [
            {
              id: "stage-a",
              projectId: "project-a",
              projectName: "Projeto A",
              title: "Integrar Roadmap D1",
              area: "integration" as const,
              state: "in_progress" as const,
              progress: 75,
              orderIndex: 1,
              currentPosition: "Adapter pronto",
              nextStep: "Expor rota",
              blocker: null,
              updatedAt: "2026-08-07T22:00:00.000Z",
            },
          ],
          blocked: [],
          completed: [],
        },
      })),
    };
    const app = createApiApp({ authProvider, privateRoadmap });

    const response = await app.request("/api/v1/private/roadmap", {
      headers: { cookie: "semogtw_session=raw-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(privateRoadmap.getRoadmap).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        items: [{ id: "stage-a", state: "in_progress" }],
        board: { in_progress: [{ id: "stage-a" }] },
      },
    });
  });
});
