import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrowthProgress } from "./growth-progress";

describe("GrowthProgress", () => {
  it("renders measurable progress with an accessible meter and explanation", () => {
    render(
      <GrowthProgress
        title="Aprender Python"
        progress={{
          percent: 65,
          measurable: true,
          completedWeight: 65,
          effectiveWeight: 100,
          requiredCheckpointsComplete: false,
        }}
        checkpointCount={5}
        completedCheckpointCount={3}
        explanation={[
          { checkpointId: "checkpoint-1", label: "Fundamentos", ratio: 1, weightedContribution: 20 },
          { checkpointId: "checkpoint-2", label: "Prática", ratio: 0.5, weightedContribution: 45 },
        ]}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "Progresso de Aprender Python" })).toHaveAttribute(
      "value",
      "65",
    );
    expect(
      screen.getByText("65% — 3 de 5 checkpoints concluídos, considerando os pesos atuais."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fundamentos")).toBeInTheDocument();
    expect(screen.getByText("20 pontos")).toBeInTheDocument();
    expect(screen.getByText("45 pontos")).toBeInTheDocument();
  });

  it("renders an honest indeterminate state without a fake zero", () => {
    render(
      <GrowthProgress
        title="Meta sem checkpoints"
        progress={{
          percent: null,
          measurable: false,
          completedWeight: 0,
          effectiveWeight: 0,
          requiredCheckpointsComplete: false,
        }}
        checkpointCount={0}
        completedCheckpointCount={0}
        explanation={[]}
      />,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Progresso ainda não calculável.")).toBeInTheDocument();
    expect(
      screen.getByText("Adicione checkpoints ou defina uma regra mensurável."),
    ).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("rejects invalid numeric projections instead of rendering misleading progress", () => {
    expect(() =>
      render(
        <GrowthProgress
          title="Inválida"
          progress={{
            percent: 101,
            measurable: true,
            completedWeight: 101,
            effectiveWeight: 100,
            requiredCheckpointsComplete: true,
          }}
          checkpointCount={1}
          completedCheckpointCount={1}
          explanation={[]}
        />,
      ),
    ).toThrow("GROWTH_PROGRESS_PERCENT_INVALID");
  });
});
