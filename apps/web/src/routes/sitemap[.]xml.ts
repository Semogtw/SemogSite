import { createFileRoute } from "@tanstack/react-router";
import { readPublicEditorial } from "../server/public-editorial.server";
import { readPublicProjects } from "../server/public-projects.server";
import {
  buildPortfolioSitemap,
  normalizePublicOrigin,
} from "./-public-discovery";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [projects, notes] = await Promise.all([
          readPublicProjects(),
          readPublicEditorial({ kind: "note", limit: 100 }),
        ]);
        return new Response(
          buildPortfolioSitemap(
            normalizePublicOrigin(request.url),
            projects,
            notes,
          ),
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
