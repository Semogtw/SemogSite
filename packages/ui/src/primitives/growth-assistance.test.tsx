import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdvancedDisclosure } from "./advanced-disclosure";
import { AssistanceSource } from "./assistance-source";
import { ProgressMeter } from "./progress-meter";

describe("AdvancedDisclosure", () => {
  it("uses semantic details and stays closed by default", () => {
    render(
      <AdvancedDisclosure summary="Configurações avançadas">
        <span>Conteúdo técnico</span>
      </AdvancedDisclosure>,
    );

    const details = screen.getByText("Configurações avançadas").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Conteúdo técnico")).toBeInTheDocument();
  });

  it("can be opened explicitly", () => {
    render(
      <AdvancedDisclosure summary="Detalhes" defaultOpen>
        <span>Aberto</span>
      </AdvancedDisclosure>,
    );
    expect(screen.getByText("Detalhes").closest("details")).toHaveAttribute(
      "open",
    );
  });
});

describe("AssistanceSource", () => {
  it.each([
    [{ kind: "manual" } as const, "Inserido manualmente"],
    [
      {
        kind: "deterministic_rule",
        ruleId: "equal-weights",
        ruleVersion: 1,
      } as const,
      "Calculado automaticamente",
    ],
    [
      {
        kind: "template",
        templateId: "learn_programming_language",
        templateVersion: 1,
      } as const,
      "Estrutura de modelo",
    ],
    [
      {
        kind: "external_ai_client",
        clientId: "client-1",
        declaredProvider: "OpenAI",
        declaredModel: "GPT",
      } as const,
      "Proposta de IA conectada",
    ],
    [
      {
        kind: "internal_model_provider",
        providerId: "provider-1",
        modelId: "model-1",
      } as const,
      "Proposta de IA configurada",
    ],
  ])("labels %o truthfully", (origin, label) => {
    render(<AssistanceSource origin={origin} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("ProgressMeter", () => {
  it("renders an accessible numeric progress element", () => {
    render(
      <ProgressMeter
        value={65}
        label="Progresso da meta"
        explanation="Três checkpoints contribuíram para o valor atual."
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Progresso da meta" }),
    ).toHaveAttribute("value", "65");
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(
      screen.getByText("Três checkpoints contribuíram para o valor atual."),
    ).toBeInTheDocument();
  });

  it("renders an indeterminate explanation without fake zero", () => {
    render(
      <ProgressMeter
        value={null}
        label="Progresso da meta"
        explanation="Adicione checkpoints mensuráveis."
      />,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Progresso ainda não calculável")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("rejects invalid numeric values", () => {
    expect(() =>
      render(
        <ProgressMeter
          value={Number.NaN}
          label="Inválido"
          explanation="Inválido"
        />,
      ),
    ).toThrow("PROGRESS_METER_VALUE_INVALID");
  });
});
