import { describe, expect, it } from "vitest";
import { TodayService, type TodayDataSource } from "./today-service";

const source: TodayDataSource = {
  listCurrentWork: async () => [
    {
      stageId: "high-active",
      projectId: "p3",
      projectSlug: "project-3",
      projectName: "Projeto 3",
      projectPriority: "high",
      title: "Implementar",
      progress: 30,
      currentPosition: "Base pronta",
      nextStep: "Continuar",
      partiallyBlocked: false,
      orderIndex: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
      latestEvidence: null,
    },
    {
      stageId: "critical-active",
      projectId: "p2",
      projectSlug: "project-2",
      projectName: "Projeto 2",
      projectPriority: "critical",
      title: "Integrar",
      progress: 60,
      currentPosition: "Adaptador pronto",
      nextStep: "Validar",
      partiallyBlocked: false,
      orderIndex: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
      latestEvidence: null,
    },
    {
      stageId: "critical-partially-blocked",
      projectId: "p1",
      projectSlug: "project-1",
      projectName: "Projeto 1",
      projectPriority: "critical",
      title: "Migrar",
      progress: 50,
      currentPosition: "Leitura concluída",
      nextStep: "Executar gate local",
      partiallyBlocked: true,
      orderIndex: 3,
      updatedAt: "2026-07-31T23:00:00.000Z",
      latestEvidence: null,
    },
  ],
  listNextWork: async () => [],
  listOwnerAttention: async () => [],
  listExternalDependencies: async () => [],
  listRecentActivity: async () => [],
};

describe("TodayService", () => {
  it("orders current work by priority, partial blockage, stage order, and activity", async () => {
    const queue = await new TodayService(source).getQueue();

    expect(queue.executeNow.map((item) => item.stageId)).toEqual([
      "critical-partially-blocked",
      "critical-active",
      "high-active",
    ]);
    expect(queue.executeNow[0]?.projectSlug).toBe("project-1");
  });
});
