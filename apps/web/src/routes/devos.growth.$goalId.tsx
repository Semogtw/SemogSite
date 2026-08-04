import { EmptyState } from "@semogtw/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DevOSShell } from "../components/devos/devos-shell";
import { GrowthGoalDetail } from "../components/devos/growth-goal-detail";
import { getGrowthGoalFn } from "../server/devos-growth";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/growth/$goalId")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: async ({ params }) => {
    const result = await getGrowthGoalFn({
      data: { goalId: params.goalId },
    });
    if (result.ok) return result.goal;
    if (result.code === "NOT_FOUND") return null;
    throw new Error(
      result.code === "UNAUTHORIZED"
        ? "GROWTH_ROUTE_UNAUTHORIZED"
        : result.code === "VALIDATION_FAILED"
          ? "GROWTH_GOAL_ID_INVALID"
          : "GROWTH_ROUTE_READ_FAILED",
    );
  },
  head: () => ({
    meta: [
      { title: "Meta de aprendizado — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: GrowthGoalRoutePage,
});

function GrowthGoalRoutePage() {
  const goal = Route.useLoaderData();

  if (goal === null) {
    return (
      <DevOSShell activePath="/devos/growth">
        <header className="devos-page-header">
          <div>
            <p className="eyebrow">Growth privado</p>
            <h1>Meta não encontrada</h1>
          </div>
        </header>
        <EmptyState
          title="Nenhuma meta corresponde a este endereço"
          description="O identificador da URL não é usado para inferir ou expor dados de outra conta."
        />
        <Link className="text-link" to="/devos/growth">
          Voltar ao Growth
        </Link>
      </DevOSShell>
    );
  }

  return (
    <DevOSShell activePath="/devos/growth">
      <p>
        <Link className="text-link" to="/devos/growth">
          Voltar ao Growth
        </Link>
      </p>
      <GrowthGoalDetail goal={goal} />
    </DevOSShell>
  );
}
