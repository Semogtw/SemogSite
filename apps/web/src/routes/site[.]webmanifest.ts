import { createFileRoute } from "@tanstack/react-router";

const manifest = {
  name: "Semogtw",
  short_name: "Semogtw",
  description:
    "Portfólio técnico com projetos, habilidades, formação e conteúdo público da Semogtw.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#0b0d12",
  theme_color: "#0b0d12",
  lang: "pt-BR",
  icons: [
    {
      src: "/favicon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
} as const;

export const Route = createFileRoute("/site.webmanifest")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(manifest, {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "application/manifest+json; charset=utf-8",
          },
        }),
    },
  },
});
