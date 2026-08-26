import { createFileRoute } from "@tanstack/react-router";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Semogtw"><rect width="64" height="64" rx="16" fill="#0b0d12"/><path d="M46 17H22c-5 0-9 3.5-9 8s4 8 9 8h20c5 0 9 3.5 9 8s-4 8-9 8H18" fill="none" stroke="#7c8cff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const Route = createFileRoute("/favicon.svg")({
  server: {
    handlers: {
      GET: async () =>
        new Response(favicon, {
          headers: {
            "Cache-Control": "public, max-age=604800",
            "Content-Type": "image/svg+xml; charset=utf-8",
          },
        }),
    },
  },
});
