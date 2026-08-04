import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import { GrowthPage } from "./growth-page";

const emptyOverview: GrowthOverviewRead = {
  activeGoals: [],
  dueCheckpoints: [],
  skillSummaries: [],
  generatedAt: "2026-08-04T04:00:00.000Z",
};

describe("GrowthPage", () => {
  it("combines guided creation and private overview without advertising unavailable AI", () => {
    render(
      <GrowthPage
        csrfToken="csrf-token"
        overview={emptyOverview}
        templates={[
          {
            id: "learn_programming_language",
            label: "Aprender uma linguagem de programação",
            description: "Do fundamento ao projeto.",
          },
        ]}
        goalHref={(id) => `/devos/growth/goals/${id}`}
        onPreview={vi.fn()}
        onSubmit={vi.fn()}
        createIdempotencyKey={() =>
          "123e4567-e89b-42d3-a456-426614174000"
        }
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Growth" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Crie metas simples, acompanhe checkpoints e entenda como o progresso foi calculado."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Criar uma meta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Metas ativas" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/gerar com ia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assistente inteligente/i)).not.toBeInTheDocument();
  });
});
