import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GrowthWeightRebalance } from "./growth-weight-rebalance";

describe("GrowthWeightRebalance", () => {
  it("shows an automatic proposal that totals 100", async () => {
    const onApply = vi.fn(async () => ({ ok: true as const }));
    render(
      <GrowthWeightRebalance
        checkpointLabels={{ a: "Fundamentos", b: "Projeto" }}
        proposal={{
          checkpoints: [
            { id: "a", before: 50, after: 50, weightMode: "automatic" },
            { id: "b", before: 50, after: 50, weightMode: "automatic" },
          ],
          total: 100,
          requiresConfirmation: false,
          reason: "all_weights_automatic",
        }}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("Total proposto: 100 pontos")).toBeInTheDocument();
    expect(screen.getByText("Fundamentos")).toBeInTheDocument();
    expect(screen.getAllByText("50 → 50 pontos")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar redistribuição" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ confirmed: true }));
  });

  it("requires explicit confirmation before changing custom weights", async () => {
    const onApply = vi.fn(async () => ({ ok: true as const }));
    render(
      <GrowthWeightRebalance
        checkpointLabels={{ custom: "Peso personalizado", automatic: "Automático" }}
        proposal={{
          checkpoints: [
            { id: "custom", before: 100, after: 50, weightMode: "custom" },
            { id: "automatic", before: null, after: 50, weightMode: "automatic" },
          ],
          total: 100,
          requiresConfirmation: true,
          reason: "custom_weights_need_rebalance",
        }}
        onApply={onApply}
      />,
    );

    expect(
      screen.getByText("Esta redistribuição altera um peso personalizado."),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Aplicar redistribuição" });
    expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Confirmo a alteração dos pesos personalizados",
      }),
    );
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ confirmed: true }));
  });

  it("does not hide a failed apply behind a success message", async () => {
    render(
      <GrowthWeightRebalance
        checkpointLabels={{ a: "A" }}
        proposal={{
          checkpoints: [
            { id: "a", before: 100, after: 100, weightMode: "automatic" },
          ],
          total: 100,
          requiresConfirmation: false,
          reason: "all_weights_automatic",
        }}
        onApply={vi.fn(async () => ({ ok: false as const, code: "CONFLICT" as const }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aplicar redistribuição" }));
    expect(
      await screen.findByText("Os checkpoints mudaram. Gere uma nova prévia antes de aplicar."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pesos atualizados.")).not.toBeInTheDocument();
  });
});
