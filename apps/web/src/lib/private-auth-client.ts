export type PrivateOwner = {
  id: string;
  expiresAt: string;
};

export type PrivateAuthSession =
  | { authenticated: false }
  | { authenticated: true; owner: PrivateOwner };

export type PrivateAuthErrorDetails = {
  code: string;
  message: string;
};

export class PrivateAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, details: PrivateAuthErrorDetails) {
    super(details.message);
    this.name = "PrivateAuthError";
    this.status = status;
    this.code = details.code;
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AuthEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: PrivateAuthErrorDetails };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readAuthEnvelope<T>(response: Response): Promise<AuthEnvelope<T>> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!isObject(payload) || typeof payload.ok !== "boolean") {
    throw new Error("Auth API returned an invalid JSON envelope.");
  }
  if (payload.ok === true) {
    if (!("data" in payload)) {
      throw new Error("Auth API success envelope is missing data.");
    }
    return { ok: true, data: payload.data as T };
  }
  const error = payload.error;
  if (
    !isObject(error) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string"
  ) {
    throw new Error("Auth API error envelope is invalid.");
  }
  return {
    ok: false,
    error: { code: error.code, message: error.message },
  };
}

async function executeAuthRequest<T>(
  path: `/api/v1/auth/${string}`,
  init: RequestInit,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const response = await fetchImpl(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...init.headers,
    },
  });
  const envelope = await readAuthEnvelope<T>(response);
  if (!envelope.ok) throw new PrivateAuthError(response.status, envelope.error);
  if (!response.ok) {
    throw new Error("Auth API returned success data with a failing status.");
  }
  return envelope.data;
}

export function getPrivateAuthSession(
  fetchImpl: FetchLike = fetch,
): Promise<PrivateAuthSession> {
  return executeAuthRequest<PrivateAuthSession>(
    "/api/v1/auth/session",
    { method: "GET" },
    fetchImpl,
  );
}

export async function getPrivateOwner(
  fetchImpl: FetchLike = fetch,
): Promise<PrivateOwner | null> {
  const session = await getPrivateAuthSession(fetchImpl);
  return session.authenticated ? session.owner : null;
}

export function loginPrivateOwner(
  password: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ expiresAt: string }> {
  return executeAuthRequest<{ expiresAt: string }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    },
    fetchImpl,
  );
}

export function logoutPrivateOwner(
  csrfToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ revoked: boolean }> {
  return executeAuthRequest<{ revoked: boolean }>(
    "/api/v1/auth/logout",
    {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
    },
    fetchImpl,
  );
}
