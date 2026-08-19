import { Outlet, createFileRoute } from "@tanstack/react-router";
import auditCss from "../styles/audit.css?url";
import roadmapCss from "../styles/roadmap.css?url";
import runsCss from "../styles/runs.css?url";

export const Route = createFileRoute("/devos")({
  ssr: false,
  head: () => ({
    links: [
      { rel: "stylesheet", href: auditCss },
      { rel: "stylesheet", href: roadmapCss },
      { rel: "stylesheet", href: runsCss },
    ],
  }),
  component: DevOSBoundary,
});

function DevOSBoundary() {
  return <Outlet />;
}
