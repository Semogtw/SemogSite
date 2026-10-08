import { Outlet, createFileRoute } from "@tanstack/react-router";
import auditCss from "../styles/audit.css?url";
import devosCoreCss from "../styles/devos-core.css?url";
import editorialCss from "../styles/editorial.css?url";
import editorialPortfolioCss from "../styles/editorial-portfolio.css?url";

export const Route = createFileRoute("/devos")({
  ssr: false,
  head: () => ({
    links: [
      { rel: "stylesheet", href: devosCoreCss },
      { rel: "stylesheet", href: auditCss },
      { rel: "stylesheet", href: editorialCss },
      { rel: "stylesheet", href: editorialPortfolioCss },
    ],
  }),
  component: () => <Outlet />,
});
