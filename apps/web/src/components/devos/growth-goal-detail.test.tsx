import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LearningGoalDetailRead } from "@semogtw/database/growth";
import { GrowthGoalDetail } from "./growth-goal-detail";

const detail: LearningGoalDetailRead = {
  id: "goal-1",
  slug: "aprender-python",
  title: "Aprender Python",
  description: "Automação pessoal",
  motivation: "Criar ferramentas próprias",
  status: "active",
  priority: "high",
  targetDate: "2026-12-31",
  progress: {
    percent: 60,
    measurable: true,
    completedWeight: 60,
    effectiveWeight: 100,
    requiredCheckpointsComplete: false,
  },
  checkpointCount: 2,
  nextCheckpoint: {
    id: "checkpoint-2",
    title: "Projeto aplicado",
    status: "in_progress",
    dueDate: null,
  },
  updatedAt: "2026-08-04T05:00:00.000Z",
  version: 2,
  checkpoints: [
    {
      id: "checkpoint-1",
      goalId: "goal-1",
      title: "Fundamentos",
      description: "Sintaxe e conceitos centrais",
      status: "completed",
      required: true,
      sequence: 1,
      weight: 20,
      completionMode: { kind: "binary" },
      acceptedValue: null,
      dueDate: null,
      updatedAt: "2026-08-04T04:00:00.000Z",
      version: 2,
    },
    {
      id: "checkpoint-2",
      goalId: "goal-1",
      title: "Projeto aplicado",
      description: "Construir uma automação útil",
      status: "in_progress",
      required: true,
      sequence: 2,
      weight: 80,
      completionMode: { kind: "numeric", unit: "tarefas", target: 10 },
      acceptedValue: 5,
      dueDate: null,
      updatedAt: "2026-08-04T04:00:00.000Z",
      version: 1,
    },
  ],
  skills: [
    {
      skillId: "skill-1",
      canonicalSkillId: "skill-1",
      name: "Python",
      desiredStage: "applied",
    },
  ],
  progressExplanation: [
    { checkpointId: "checkpoint-1", ratio: 1, weightedContribution: 20 },
    { checkpointId: "checkpoint-2", ratio: 0.5, weightedContribution: 40 },
  ],
};

describe("GrowthGoalDetail", () => {
  it("shows derived progress and checkpoint contributions", () => {
    render(<GrowthGoalDetail goal={detail} />);

    expect(screen.getByRole("heading", { name: "Aprender Python" })).toBeInTheDocument();
    expect(screen.getByText("Automação pessoal")).toBeInTheDocument();
    expect(screen.getByText("Criar ferramentas próprias")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progresso de Aprender Python" }),
    ).toHaveAttribute("value", "60");
    expect(screen.getByText("20 pontos")).toBeInTheDocument();
    expect(screen.getByText("40 pontos")).toBeInTheDocument();
  });

  it("shows human checkpoint rules without an editable percentage", () => {
    render(<GrowthGoalDetail goal={detail} />);

    expect(screen.getByText("Conclusão simples")).toBeInTheDocument();
    expect(screen.getByText("5 de 10 tarefas")).toBeInTheDocument();
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
    expect(screen.queryByLabelText(/porcentagem/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /progresso/i })).not.toBeInTheDocument();
  });

  it("keeps weights and versions inside advanced disclosure", () => {
    render(<GrowthGoalDetail goal={detail} />);

    const disclosure = screen.getByText("Configurações avançadas").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText("Peso: 20 pontos")).toBeInTheDocument();
    expect(screen.getByText("Versão: 2")).toBeInTheDocument();
  });

  it("uses canonical skill names rather than technical IDs", () => {
    render(<GrowthGoalDetail goal={detail} />);

    expect(screen.getByRole("heading", { name: "Skills relacionadas" })).toBeInTheDocument();
    expect(screen.getByText("Python — nível desejado: aplicado")).toBeInTheDocument();
    expect(screen.queryByText("skill-1")).not.toBeInTheDocument();
  });
});
