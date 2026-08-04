import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import {
  listLearningGoalTemplates,
  type LearningGoalTemplateId,
} from "@semogtw/domain/growth";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { readCookie } from "../client/cookies";
import { DevOSShell } from "../components/devos/devos-shell";
import {
  GrowthPage,
  type GrowthPageProps,
} from "../components/devos/growth-page";
import {
  getGrowthOverviewFn,
  previewLearningGoalTemplateFn,
  quickCreateLearningGoalFn,
} from "../server/devos-growth";
import { requireOwner } from "../server/require-owner";

const templates = listLearningGoalTemplates().map((template) => ({
  id: template.id,
  label: template.label,
  description: template.description,
}));

export const Route = createFileRoute("/devos/growth")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  loader: async () => {
    const result = await getGrowthOverviewFn();
    if (!result.ok) {
      throw new Error(
        result.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : "GROWTH_ROUTE_READ_FAILED",
      );
    }
    return result.overview;
  },
  head: () => ({
    meta: [
      { title: "Growth — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: GrowthRoutePage,
});

function GrowthRoutePage() {
  const overview = Route.useLoaderData();
  const router = useRouter();
  const csrfToken = readCookie(CSRF_COOKIE_NAME) ?? "";

  const onPreview: GrowthPageProps["onPreview"] = async (
    templateId: LearningGoalTemplateId,
  ) => {
    const result = await previewLearningGoalTemplateFn({
      data: { templateId },
    });
    if (!result.ok) {
      throw new Error(
        result.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : "GROWTH_TEMPLATE_NOT_FOUND",
      );
    }
    return result.template;
  };

  const onSubmit: GrowthPageProps["onSubmit"] = async (input) => {
    const currentCsrfToken = readCookie(CSRF_COOKIE_NAME);
    if (currentCsrfToken === null) {
      return { ok: false, code: "CSRF_INVALID" };
    }

    const result = await quickCreateLearningGoalFn({
      data: {
        ...input,
        csrfToken: currentCsrfToken,
      },
    });
    if (!result.ok) return result;

    await router.invalidate();
    return {
      ok: true,
      goalId: result.goal.id,
      replayed: result.replayed,
    };
  };

  return (
    <DevOSShell activePath="/devos/growth">
      <GrowthPage
        csrfToken={csrfToken}
        overview={overview}
        templates={templates}
        goalHref={(goalId) => `/devos/growth/${encodeURIComponent(goalId)}`}
        onPreview={onPreview}
        onSubmit={onSubmit}
      />
    </DevOSShell>
  );
}
