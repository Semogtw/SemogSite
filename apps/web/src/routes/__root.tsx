import sharedCss from "@semogtw/ui/styles/global.css?url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import auditCss from "../styles/audit.css?url";
import captureCss from "../styles/capture.css?url";
import evidenceCss from "../styles/evidence.css?url";
import globalCss from "../styles/global.css?url";
import publicProjectsCss from "../styles/public-projects.css?url";
import roadmapCss from "../styles/roadmap.css?url";
import stageCompletionCss from "../styles/stage-completion.css?url";
import surfacesCss from "../styles/surfaces.css?url";

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Semogtw — Produtos, sistemas e experimentos" },
      {
        name: "description",
        content:
          "Plataforma editorial da Semogtw para projetos, notas técnicas e experimentos.",
      },
    ],
    links: [
      { rel: "stylesheet", href: sharedCss },
      { rel: "stylesheet", href: globalCss },
      { rel: "stylesheet", href: surfacesCss },
      { rel: "stylesheet", href: captureCss },
      { rel: "stylesheet", href: evidenceCss },
      { rel: "stylesheet", href: stageCompletionCss },
      { rel: "stylesheet", href: auditCss },
      { rel: "stylesheet", href: roadmapCss },
      { rel: "stylesheet", href: publicProjectsCss },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <Document>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </Document>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <main className="system-page">
      <p className="eyebrow">Erro 404</p>
      <h1>Página não encontrada.</h1>
      <p>O endereço pode ter mudado ou ainda não fazer parte da plataforma.</p>
      <Link className="text-link" to="/">
        Voltar ao início
      </Link>
    </main>
  );
}

function ErrorPage() {
  return (
    <main className="system-page" role="alert">
      <p className="eyebrow">Falha temporária</p>
      <h1>Não foi possível abrir esta página.</h1>
      <p>Nenhum detalhe interno foi exposto. Tente novamente em instantes.</p>
      <a className="text-link" href="/">
        Recarregar a plataforma
      </a>
    </main>
  );
}
