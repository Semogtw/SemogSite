import { Hono } from "hono";

export function createApiApp() {
  return new Hono().get("/health", (context) =>
    context.json({
      ok: true,
      service: "semogtw-api",
    }),
  );
}

export const app = createApiApp();
export type ApiApp = typeof app;
