import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ApiEnvironment } from "./request-context";

function disableFailureCaching(context: {
  header(name: string, value: string): void;
}): void {
  context.header("cache-control", "no-store");
  context.header("pragma", "no-cache");
}

export const sanitizedErrorHandler: ErrorHandler<ApiEnvironment> = (
  _error,
  context,
) => {
  disableFailureCaching(context);
  return context.json(
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
};

export const sanitizedNotFoundHandler: NotFoundHandler<ApiEnvironment> = (
  context,
) => {
  disableFailureCaching(context);
  return context.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Recurso não encontrado.",
        correlationId: context.get("correlationId"),
      },
    },
    404,
  );
};
