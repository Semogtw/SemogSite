import { createFileRoute } from "@tanstack/react-router";
import {
  buildPortfolioRobots,
  normalizePublicOrigin,
} from "./-public-discovery";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(buildPortfolioRobots(normalizePublicOrigin(request.url)), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
    },
  },
});
