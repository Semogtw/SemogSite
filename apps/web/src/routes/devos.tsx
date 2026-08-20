import { Outlet, createFileRoute } from "@tanstack/react-router";
import auditCss from "../styles/audit.css?url";
import captureCss from "../styles/capture.css?url";
import devosCoreCss from "../styles/devos-core.css?url";
import editorialCss from "../styles/editorial.css?url";
import editorialPortfolioCss from "../styles/editorial-portfolio.css?url";
import evidenceCss from "../styles/evidence.css?url";
import githubSyncCss from "../styles/github-sync.css?url";
import repositoryTargetLifecycleCss from "../styles/repository-target-lifecycle.css?url";
import repositoryTargetCss from "../styles/repository-target.css?url";
import roadmapCss from "../styles/roadmap.css?url";
import runsCss from "../styles/runs.css?url";
import stageCompletionCss from "../styles/stage-completion.css?url";

export const Route = createFileRoute("/devos")({
  ssr: false,
  head: () => ({
    links: [
      { rel: "stylesheet", href: devosCoreCss },
      { rel: "stylesheet", href: auditCss },
      { rel: "stylesheet", href: captureCss },
      { rel: "stylesheet", href: editorialCss },
      { rel: "stylesheet", href: editorialPortfolioCss },
      { rel: "stylesheet", href: evidenceCss },
      { rel: "stylesheet", href: githubSyncCss },
      { rel: "stylesheet", href: repositoryTargetLifecycleCss },
      { rel: "stylesheet", href: repositoryTargetCss },
      { rel: "stylesheet", href: roadmapCss },
      { rel: "stylesheet", href: runsCss },
      { rel: "stylesheet", href: stageCompletionCss },
    ],
  }),
  component: DevOSBoundary,
});

function DevOSBoundary() {
  return <Outlet />;
}
