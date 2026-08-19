import { createFileRoute } from "@tanstack/react-router";
import {
  buildPortfolioSitemap,
  normalizePublicOrigin,
} from "./-public-discovery";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(buildPortfolioSitemap(normalizePublicOrigin(request.url)), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "application/xml; charset=utf-8",
          },
        }),
    },
  },
});
