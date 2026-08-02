import { createMiddleware } from "hono/factory";

export type ApiVariables = {
  correlationId: string;
  owner: {
    id: string;
    sessionId: string;
    expiresAt: string;
  } | null;
};

export type ApiEnvironment = {
  Variables: ApiVariables;
};

export const requestContext = createMiddleware<ApiEnvironment>(
  async (context, next) => {
    const supplied = context.req.header("x-correlation-id");
    const correlationId =
      supplied !== undefined && /^[a-zA-Z0-9._-]{8,128}$/u.test(supplied)
        ? supplied
        : crypto.randomUUID();

    context.set("correlationId", correlationId);
    context.set("owner", null);
    context.header("x-correlation-id", correlationId);
    await next();
  },
);
