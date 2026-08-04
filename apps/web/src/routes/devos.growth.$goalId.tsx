import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { EmptyState } from "@semogtw/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { readCookie } from "../client/cookies";
import { DevOSShell } from "../components/devos/devos-shell";
import { GrowthGoalDetail } from "../components/devos/growth-goal-detail";
import { GrowthWeightRebalance } from "../components/devos/growth-weight-rebalance";
import { getGrowthGoalFn } from "../server/devos-growth";
import {
  applyGrowthWeightRebalanceFn,
  previewGrowthWeightRebalanceFn,
} from "../server/devos-growth-weight-rebalance";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/growth/$goalId")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: async ({ params }) => {
    const result = await getGrowthGoalFn({
      data: { goalId: params.goalId },
    });
    if (!result.ok) {
      if (result.code === "NOT_FOUND") return { goal: null, rebalance: null };
      throw new Error(
        result.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : result.code === "VALIDATION_FAILED"
            ? "GROWTH_GOAL_ID_INVALID"
            : "GROWTH_ROUTE_READ_FAILED",
      );
    }

    const preview = await previewGrowthWeightRebalanceFn({
      data: { goalId: params.goalId },
    });
    if (
      !preview.ok &&
      preview.code !== "CHECKPOINTS_REQUIRED" &&
      preview.code !== "GOAL_NOT_EDITABLE"
    ) {
      throw new Error(
        preview.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : "GROWTH_WEIGHT_PREVIEW_FAILED",
      );
    }

    return {
      goal: result.goal,
      rebalance: preview.ok ? preview : null,
    };
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
  const { goal, rebalance } = Route.useLoaderData();
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

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

  const checkpointLabels = Object.fromEntries(
    goal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.title]),
  );

  return (
    <DevOSShell activePath="/devos/growth">
      <p>
        <Link className="text-link" to="/devos/growth">
          Voltar ao Growth
        </Link>
      </p>
      <GrowthGoalDetail goal={goal} />
      {rebalance === null ? null : (
        <GrowthWeightRebalance
          checkpointLabels={checkpointLabels}
          proposal={rebalance.proposal}
          onApply={async ({ confirmed }) => {
            const csrfToken = readCookie(CSRF_COOKIE_NAME);
            if (csrfToken === null) {
              return { ok: false, code: "WRITE_FAILED" };
            }
            const result = await applyGrowthWeightRebalanceFn({
              data: {
                csrfToken,
                idempotencyKey,
                goalId: goal.id,
                expectedGoalVersion: rebalance.goalVersion,
                expectedCheckpointVersions: rebalance.checkpointVersions,
                reason: "Redistribuir pesos dos checkpoints",
                confirmed,
              },
            });
            if (!result.ok) {
              return {
                ok: false,
                code: result.code === "CONFLICT" ? "CONFLICT" : "WRITE_FAILED",
              };
            }
            setIdempotencyKey(crypto.randomUUID());
            await router.invalidate();
            return { ok: true };
          }}
        />
      )}
    </DevOSShell>
  );
}
