import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import { GrowthOverview } from "./growth-overview";

const overview: GrowthOverviewRead = {
  activeGoals: [
    {
      id: "goal-1",
      slug: "aprender-python",
      title: "Aprender Python",
      status: "active",
      priority: "high",
      targetDate: "2026-12-31",
      progress: {
        percent: 40,
        measurable: true,
        completedWeight: 40,
        effectiveWeight: 100,
        requiredCheckpointsComplete: false,
      },
      checkpointCount: 5,
      nextCheckpoint: {
        id: "checkpoint-2",
        title: "Prática guiada",
        status: "in_progress",
        dueDate: "2026-08-10",
      },
      updatedAt: "2026-08-04T04:00:00.000Z",
      version: 2,
    },
    {
      id: "goal-2",
      slug: "meta-sem-base",
      title: "Meta sem base mensurável",
      status: "active",
      priority: "medium",
      targetDate: null,
      progress: {
        percent: null,
        measurable: false,
        completedWeight: 0,
        effectiveWeight: 0,
        requiredCheckpointsComplete: false,
      },
      checkpointCount: 0,
      nextCheckpoint: null,
      updatedAt: "2026-08-04T03:00:00.000Z",
      version: 1,
    },
  ],
  dueCheckpoints: [
    {
      id: "checkpoint-2",
      goalId: "goal-1",
      goalTitle: "Aprender Python",
      title: "Prática guiada",
      status: "in_progress",
      required: true,
      sequence: 2,
      weight: 20,
      dueDate: "2026-08-10",
    },
  ],
  skillSummaries: [
    {
      id: "skill-1",
      slug: "python",
      name: "Python",
      description: "",
      status: "active",
      canonicalSkillId: "skill-1",
      aliases: ["python"],
      updatedAt: "2026-08-04T02:00:00.000Z",
      version: 1,
    },
  ],
  generatedAt: "2026-08-04T04:00:00.000Z",
};

describe("GrowthOverview", () => {
  it("shows active goals, honest progress and next actions", () => {
    render(<GrowthOverview overview={overview} goalHref={(id) => `/devos/growth/goals/${id}`} />);

    expect(screen.getByRole("heading", { name: "Metas ativas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aprender Python" })).toHaveAttribute(
      "href",
      "/devos/growth/goals/goal-1",
    );
    expect(screen.getByText("40% concluído")).toBeInTheDocument();
    expect(screen.getByText("Próximo: Prática guiada")).toBeInTheDocument();
    expect(screen.getByText("Progresso ainda não calculável")).toBeInTheDocument();
    expect(screen.queryByText("0% concluído")).not.toBeInTheDocument();
  });

  it("shows due checkpoints and active skills without technical IDs", () => {
    render(<GrowthOverview overview={overview} goalHref={(id) => `/goal/${id}`} />);

    expect(screen.getByRole("heading", { name: "Próximos checkpoints" })).toBeInTheDocument();
    expect(screen.getByText("Prática guiada")).toBeInTheDocument();
    expect(screen.getByText("10/08/2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.queryByText("skill-1")).not.toBeInTheDocument();
    expect(screen.queryByText("checkpoint-2")).not.toBeInTheDocument();
  });

  it("renders useful empty states", () => {
    render(
      <GrowthOverview
        overview={{
          activeGoals: [],
          dueCheckpoints: [],
          skillSummaries: [],
          generatedAt: "2026-08-04T04:00:00.000Z",
        }}
        goalHref={(id) => `/goal/${id}`}
      />,
    );

    expect(screen.getByText("Nenhuma meta ativa ainda.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum checkpoint com prazo próximo.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma skill registrada ainda.")).toBeInTheDocument();
  });
});
