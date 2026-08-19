import { createFileRoute } from "@tanstack/react-router";
import { readPublicProjects } from "../server/public-projects.server";
import {
  buildPortfolioSitemap,
  normalizePublicOrigin,
} from "./-public-discovery";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const projects = await readPublicProjects();
        return new Response(
          buildPortfolioSitemap(normalizePublicOrigin(request.url), projects),
          {
            headers: {
              "Cache-Control": "public, max-age=300",
              "Content-Type": "application/xml; charset=utf-8",
            },
          },
        );
      },
    },
  },
});
