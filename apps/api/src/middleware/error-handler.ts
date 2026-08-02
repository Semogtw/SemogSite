import type { ErrorHandler } from "hono";
import type { ApiEnvironment } from "./request-context";

export const sanitizedErrorHandler: ErrorHandler<ApiEnvironment> = (
  _error,
  context,
) =>
  context.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a solicitação.",
        correlationId: context.get("correlationId"),
      },
    },
    500,
  );
