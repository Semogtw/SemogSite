export type PrivateRetrySemantics =
  | "atomic-create"
  | "deduplicated-state"
  | "optimistic-concurrency"
  | "semantic-idempotency";

export type PrivateStateWriteCapability = {
  name: string;
  method: "POST";
  path: `/api/v1/private/${string}`;
  externalEffect: false;
  retrySemantics: PrivateRetrySemantics;
};

export type PrivateRuntimeCapabilities = {
  runtime: "cloudflare-worker-d1" | "node-sqlite";
  canonicalStorage: "d1" | "sqlite";
  stateWrites: readonly string[];
  stateWriteEndpoints: readonly PrivateStateWriteCapability[];
  externalEffects: {
    repositoryCheckout: false;
    repositoryFetch: false;
    repositoryPush: false;
    commandExecution: false;
    processControl: false;
  };
  semantics: {
    ownerSessionRequired: true;
    sameOriginRequired: true;
    csrfRequiredForMutations: true;
    auditLedger: true;
    optimisticConcurrency: true;
    semanticIdempotency: true;
  };
};

export type PrivateApiErrorDetails = {
  code: string;
  message: string;
  correlationId?: string;
  details?: unknown;
};

export class PrivateApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | undefined;
  readonly details: unknown;

  constructor(status: number, error: PrivateApiErrorDetails) {
    super(error.message);
    this.name = "PrivateApiError";
    this.status = status;
    this.code = error.code;
    this.correlationId = error.correlationId;
    this.details = error.details;
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: PrivateApiErrorDetails };

type CsrfTokenProvider = () => string | Promise<string>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function parseCapability(value: unknown): PrivateStateWriteCapability | null {
  if (!isObject(value)) return null;
  const retrySemantics = value.retrySemantics;
  if (
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.method !== "POST" ||
    typeof value.path !== "string" ||
    !value.path.startsWith("/api/v1/private/") ||
    value.path.endsWith("/") ||
    value.externalEffect !== false ||
    (retrySemantics !== "atomic-create" &&
      retrySemantics !== "deduplicated-state" &&
      retrySemantics !== "optimistic-concurrency" &&
      retrySemantics !== "semantic-idempotency")
  ) {
    return null;
  }
  return {
    name: value.name,
    method: "POST",
    path: value.path as `/api/v1/private/${string}`,
    externalEffect: false,
    retrySemantics,
  };
}

function parseCapabilities(value: unknown): PrivateRuntimeCapabilities {
  if (!isObject(value)) throw new Error("Invalid private capability payload.");
  const endpointsValue = value.stateWriteEndpoints;
  if (!Array.isArray(endpointsValue)) {
    throw new Error("Invalid private capability endpoint registry.");
  }
  const stateWriteEndpoints = endpointsValue.map(parseCapability);
  if (stateWriteEndpoints.some((item) => item === null)) {
    throw new Error("Invalid private capability endpoint entry.");
  }
  if (
    (value.runtime !== "cloudflare-worker-d1" && value.runtime !== "node-sqlite") ||
    (value.canonicalStorage !== "d1" && value.canonicalStorage !== "sqlite") ||
    !Array.isArray(value.stateWrites) ||
    !value.stateWrites.every((item) => typeof item === "string") ||
    !isObject(value.externalEffects) ||
    !isObject(value.semantics)
  ) {
    throw new Error("Invalid private capability payload.");
  }
  if (
    (value.runtime === "cloudflare-worker-d1" && value.canonicalStorage !== "d1") ||
    (value.runtime === "node-sqlite" && value.canonicalStorage !== "sqlite")
  ) {
    throw new Error("Private capability runtime/storage pair is inconsistent.");
  }

  const effects = value.externalEffects;
  if (
    effects.repositoryCheckout !== false ||
    effects.repositoryFetch !== false ||
    effects.repositoryPush !== false ||
    effects.commandExecution !== false ||
    effects.processControl !== false
  ) {
    throw new Error("Private API unexpectedly advertises external effects.");
  }

  const semantics = value.semantics;
  if (
    semantics.ownerSessionRequired !== true ||
    semantics.sameOriginRequired !== true ||
    semantics.csrfRequiredForMutations !== true ||
    semantics.auditLedger !== true ||
    semantics.optimisticConcurrency !== true ||
    semantics.semanticIdempotency !== true
  ) {
    throw new Error("Private API security semantics are weaker than required.");
  }

  const endpoints = stateWriteEndpoints as PrivateStateWriteCapability[];
  const endpointNames = endpoints.map((item) => item.name);
  const endpointPaths = endpoints.map((item) => item.path);
  const stateWrites = [...value.stateWrites] as string[];
  if (
    hasDuplicates(endpointNames) ||
    hasDuplicates(endpointPaths) ||
    hasDuplicates(stateWrites)
  ) {
    throw new Error("Private capability registry contains duplicates.");
  }
  if (JSON.stringify(endpointNames) !== JSON.stringify(stateWrites)) {
    throw new Error("Private capability names do not match endpoint registry.");
  }

  return {
    runtime: value.runtime,
    canonicalStorage: value.canonicalStorage,
    stateWrites,
    stateWriteEndpoints: endpoints,
    externalEffects: {
      repositoryCheckout: false,
      repositoryFetch: false,
      repositoryPush: false,
      commandExecution: false,
      processControl: false,
    },
    semantics: {
      ownerSessionRequired: true,
      sameOriginRequired: true,
      csrfRequiredForMutations: true,
      auditLedger: true,
      optimisticConcurrency: true,
      semanticIdempotency: true,
    },
  };
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!isObject(payload) || typeof payload.ok !== "boolean") {
    throw new Error("Private API returned an invalid JSON envelope.");
  }
  if (payload.ok === true) {
    if (!("data" in payload)) {
      throw new Error("Private API success envelope is missing data.");
    }
    return { ok: true, data: payload.data as T };
  }
  const error = payload.error;
  if (
    !isObject(error) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string"
  ) {
    throw new Error("Private API error envelope is invalid.");
  }
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(typeof error.correlationId === "string"
        ? { correlationId: error.correlationId }
        : {}),
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

export async function loadPrivateRuntimeCapabilities(
  fetchImpl: FetchLike = fetch,
): Promise<PrivateRuntimeCapabilities> {
  const response = await fetchImpl("/api/v1/private/capabilities", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const envelope = await readEnvelope<unknown>(response);
  if (!envelope.ok) throw new PrivateApiError(response.status, envelope.error);
  if (!response.ok) {
    throw new Error("Private capability request returned an inconsistent status.");
  }
  return parseCapabilities(envelope.data);
}

export function findPrivateStateWriteCapability(
  capabilities: PrivateRuntimeCapabilities,
  operation: string,
): PrivateStateWriteCapability {
  const capability = capabilities.stateWriteEndpoints.find(
    (item) => item.name === operation,
  );
  if (capability === undefined) {
    throw new Error(`Private operation is not available: ${operation}`);
  }
  return capability;
}

export async function executePrivateStateWrite<T>(options: {
  capabilities: PrivateRuntimeCapabilities;
  operation: string;
  payload: unknown;
  csrfToken: string;
  fetchImpl?: FetchLike;
}): Promise<T> {
  const capability = findPrivateStateWriteCapability(
    options.capabilities,
    options.operation,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(capability.path, {
    method: capability.method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": options.csrfToken,
    },
    body: JSON.stringify(options.payload),
  });

  const returnedOperation = response.headers.get("x-semogtw-operation");
  const returnedRetrySemantics = response.headers.get(
    "x-semogtw-retry-semantics",
  );
  if (
    returnedOperation !== capability.name ||
    returnedRetrySemantics !== capability.retrySemantics
  ) {
    throw new Error("Private API operation metadata does not match capabilities.");
  }

  const envelope = await readEnvelope<T>(response);
  if (!envelope.ok) throw new PrivateApiError(response.status, envelope.error);
  if (!response.ok) {
    throw new Error("Private API returned success data with a failing status.");
  }
  return envelope.data;
}

/**
 * Browser-safe facade for private state writes.
 *
 * Capabilities are cached per client instance, while CSRF is requested for
 * every mutation so session/token rotation does not require rebuilding it.
 * A missing operation forces one capability refresh before failing.
 */
export function createPrivateApiClient(options: {
  getCsrfToken: CsrfTokenProvider;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let capabilitiesPromise: Promise<PrivateRuntimeCapabilities> | null = null;

  const getCapabilities = (refresh = false) => {
    if (refresh || capabilitiesPromise === null) {
      capabilitiesPromise = loadPrivateRuntimeCapabilities(fetchImpl).catch((error) => {
        capabilitiesPromise = null;
        throw error;
      });
    }
    return capabilitiesPromise;
  };

  const resolveCapability = async (operation: string) => {
    let capabilities = await getCapabilities();
    let capability = capabilities.stateWriteEndpoints.find(
      (item) => item.name === operation,
    );
    if (capability === undefined) {
      capabilities = await getCapabilities(true);
      capability = capabilities.stateWriteEndpoints.find(
        (item) => item.name === operation,
      );
    }
    if (capability === undefined) {
      throw new Error(`Private operation is not available: ${operation}`);
    }
    return capabilities;
  };

  return {
    getCapabilities,
    clearCapabilities() {
      capabilitiesPromise = null;
    },
    async mutate<T>(operation: string, payload: unknown): Promise<T> {
      const capabilities = await resolveCapability(operation);
      const csrfToken = (await options.getCsrfToken()).trim();
      if (csrfToken.length === 0) {
        throw new Error("Private mutation requires a CSRF token.");
      }
      return executePrivateStateWrite<T>({
        capabilities,
        operation,
        payload,
        csrfToken,
        fetchImpl,
      });
    },
  };
}
