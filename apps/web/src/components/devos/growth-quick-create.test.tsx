import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LearningGoalTemplateId,
  MaterializedLearningGoalTemplate,
} from "@semogtw/domain/growth";
import { GrowthQuickCreate } from "./growth-quick-create";

const programmingTemplate: MaterializedLearningGoalTemplate = {
  templateId: "learn_programming_language",
  templateVersion: 1,
  label: "Aprender uma linguagem de programação",
  description: "Do fundamento a um projeto aplicado com evidência final.",
  origin: {
    kind: "template",
    templateId: "learn_programming_language",
    templateVersion: 1,
  },
  checkpoints: [
    "Fundamentos",
    "Prática guiada",
    "Bibliotecas e ferramentas",
    "Projeto aplicado",
    "Revisão e evidência final",
  ].map((title, index) => ({
    key: `checkpoint-${index + 1}`,
    title,
    description: "",
    required: true,
    completionMode: { kind: "binary" as const },
    weight: 20,
    weightMode: "automatic" as const,
  })),
};

function renderForm(input?: {
  onPreview?: (templateId: LearningGoalTemplateId) => Promise<MaterializedLearningGoalTemplate>;
  onSubmit?: Parameters<typeof GrowthQuickCreate>[0]["onSubmit"];
}) {
  const onPreview =
    input?.onPreview ?? vi.fn(async () => programmingTemplate);
  const onSubmit =
    input?.onSubmit ??
    vi.fn(async () => ({
      ok: true as const,
      goalId: "goal-1",
      replayed: false,
    }));

  render(
    <GrowthQuickCreate
      csrfToken="csrf-token"
      templates={[
        {
          id: "learn_programming_language",
          label: "Aprender uma linguagem de programação",
          description: "Do fundamento a um projeto aplicado.",
        },
      ]}
      onPreview={onPreview}
      onSubmit={onSubmit}
      createIdempotencyKey={() =>
        "123e4567-e89b-42d3-a456-426614174000"
      }
    />,
  );

  return { onPreview, onSubmit };
}

describe("GrowthQuickCreate", () => {
  it("shows only the task-oriented normal fields", () => {
    renderForm();

    expect(
      screen.getByRole("textbox", { name: "O que deseja alcançar?" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Até quando?")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Por que isso importa?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Usar uma estrutura pronta?" }),
    ).toBeInTheDocument();

    for (const forbidden of [
      "slug",
      "id",
      "status",
      "peso",
      "porcentagem",
      "completion mode",
      "mcp",
      "gerar com ia",
    ]) {
      expect(screen.queryByText(new RegExp(forbidden, "i"))).not.toBeInTheDocument();
    }
  });

  it("loads and labels a deterministic template preview truthfully", async () => {
    const { onPreview } = renderForm();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Usar uma estrutura pronta?" }),
      { target: { value: "learn_programming_language" } },
    );

    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith("learn_programming_language"),
    );
    expect(screen.getByText("Estrutura de modelo")).toBeInTheDocument();
    expect(screen.getByText("Fundamentos")).toBeInTheDocument();
    expect(screen.getByText("Revisão e evidência final")).toBeInTheDocument();
    expect(screen.getByText("Total automático: 100%")).toBeInTheDocument();
    expect(screen.queryByText(/proposta de ia/i)).not.toBeInTheDocument();
  });

  it("submits normalized user input with a fresh UUID key", async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(
      screen.getByRole("textbox", { name: "O que deseja alcançar?" }),
      { target: { value: "Aprender Python para automação" } },
    );
    fireEvent.change(screen.getByLabelText("Até quando?"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Por que isso importa?" }),
      { target: { value: "Criar ferramentas próprias" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Usar uma estrutura pronta?" }),
      { target: { value: "learn_programming_language" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar meta" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Aprender Python para automação",
        targetDate: "2026-12-31",
        motivation: "Criar ferramentas próprias",
        templateId: "learn_programming_language",
      }),
    );
    expect(screen.getByText("Meta criada com sucesso.")).toBeInTheDocument();
  });

  it("preserves inputs and shows a stable error after a rejected submit", async () => {
    renderForm({
      onSubmit: vi.fn(async () => ({
        ok: false as const,
        code: "CONFLICT" as const,
      })),
    });

    const title = screen.getByRole("textbox", {
      name: "O que deseja alcançar?",
    });
    fireEvent.change(title, { target: { value: "Aprender Rust" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar meta" }));

    expect(await screen.findByText("A meta mudou ou já foi criada. Atualize e tente novamente.")).toBeInTheDocument();
    expect(title).toHaveValue("Aprender Rust");
  });

  it("disables duplicate submissions while one request is pending", async () => {
    let resolve: ((value: { ok: true; goalId: string; replayed: boolean }) => void) | null = null;
    const onSubmit = vi.fn(
      () =>
        new Promise<{ ok: true; goalId: string; replayed: boolean }>((done) => {
          resolve = done;
        }),
    );
    renderForm({ onSubmit });

    fireEvent.change(
      screen.getByRole("textbox", { name: "O que deseja alcançar?" }),
      { target: { value: "Meta" } },
    );
    const button = screen.getByRole("button", { name: "Criar meta" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolve?.({ ok: true, goalId: "goal-1", replayed: false });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
