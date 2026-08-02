import { describe, expect, it } from "vitest";
import { RoadmapService, type RoadmapDataSource } from "./roadmap-service";

const source: RoadmapDataSource = {
  listRoadmapItems: async () => [
    {
      id: "stage-1",
      projectId: "project-2",
      projectName: "Outro",
      title: "Ignorado",
      area: "implementation",
      state: "in_progress",
      progress: 10,
      orderIndex: 1,
      currentPosition: "",
      nextStep: "Continuar",
      blocker: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "stage-2",
      projectId: "project-1",
      projectName: "Projeto",
      title: "Implementar",
      area: "implementation",
      state: "in_progress",
      progress: 30,
      orderIndex: 2,
      currentPosition: "Base pronta",
      nextStep: "Continuar",
      blocker: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "stage-5",
      projectId: "project-1",
      projectName: "Projeto",
      title: "Desbloquear",
      area: "implementation",
      state: "blocked",
      progress: 50,
      orderIndex: 5,
      currentPosition: "Gate pendente",
      nextStep: "Executar localmente",
      blocker: "Ambiente externo",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "stage-6",
      projectId: "project-1",
      projectName: "Projeto",
      title: "Concluído",
      area: "implementation",
      state: "completed",
      progress: 100,
      orderIndex: 6,
      currentPosition: "Finalizado",
      nextStep: null,
      blocker: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

describe("RoadmapService", () => {
  it("combines filters without changing persisted order", async () => {
    const result = await new RoadmapService(source).query({
      projectIds: ["project-1"],
      states: ["in_progress", "blocked"],
      areas: ["implementation"],
      includeCompleted: false,
    });

    expect(result.items.map((item) => item.id)).toEqual(["stage-2", "stage-5"]);
    expect(result.board.in_progress.map((item) => item.id)).toEqual(["stage-2"]);
    expect(result.board.blocked.map((item) => item.id)).toEqual(["stage-5"]);
  });
});
