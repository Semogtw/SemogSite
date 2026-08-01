import { describe, expect, it } from "vitest";
import { buildAgentContext } from "./agent-context";

const fixture = {
  projectName: "Semogtw Platform",
  purpose: "Coordenar projetos sem depender da memória da conversa.",
  recordedBranch: "develop/foundation-bootstrap",
  currentState: "Fundação em implementação",
  activeStages: ["Modelo de dados", "Autenticação"],
  nextActions: ["Executar build completo"],
  blockers: ["Vitest indisponível no registry atual"],
  testsPassed: ["Invariantes com runner nativo do Node"],
  testsNotRun: ["Build TanStack Start"],
  links: ["https://github.com/Semogtw/SemogSite"],
  safetyConstraints: ["Nunca incluir tokens ou código privado completo"],
  updatedAt: "2026-08-01T00:00:00.000Z",
  confidence: "high" as const,
};

describe("buildAgentContext", () => {
  it("creates compact timestamped context without secrets or full code", () => {
    const context = buildAgentContext({
      ...fixture,
      blockers: ["Token ghp_super_secret não deve aparecer"],
      activeStages: ["PRIVATE_SOURCE_CODE"],
    });

    expect(context).toContain("Branch registrada:");
    expect(context).toContain("Próximo passo:");
    expect(context).toContain("Informação atualizada em:");
    expect(context).not.toContain("ghp_super_secret");
    expect(context).not.toContain("PRIVATE_SOURCE_CODE");
    expect(context.length).toBeLessThanOrEqual(6_000);
  });
});
