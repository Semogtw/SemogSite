const encoder = new TextEncoder();

export type RuntimeNodeEnv = "development" | "test" | "production";

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function sessionCookieOptions(nodeEnv: RuntimeNodeEnv) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: nodeEnv === "production",
    path: "/" as const,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

export function csrfCookieOptions(nodeEnv: RuntimeNodeEnv) {
  return {
    httpOnly: false as const,
    sameSite: "lax" as const,
    secure: nodeEnv === "production",
    path: "/" as const,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function issueCsrfToken(
  sessionSecret: string,
  sessionId: string,
): Promise<string> {
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  return `${nonce}.${await hmac(sessionSecret, `${sessionId}:${nonce}`)}`;
}

export async function verifyCsrfToken(
  sessionSecret: string,
  sessionId: string,
  cookieToken: string | null,
  headerToken: string | null,
): Promise<boolean> {
  if (
    cookieToken === null ||
    headerToken === null ||
    !constantTimeEqual(cookieToken, headerToken)
  ) {
    return false;
  }

  const separator = cookieToken.indexOf(".");
  if (separator <= 0) return false;
  const nonce = cookieToken.slice(0, separator);
  const signature = cookieToken.slice(separator + 1);
  const expected = await hmac(sessionSecret, `${sessionId}:${nonce}`);
  return constantTimeEqual(signature, expected);
}

export type RateLimiterOptions = {
  maxAttempts: number;
  windowMs: number;
};

export class SlidingWindowRateLimiter {
  readonly #attempts = new Map<string, number[]>();

  constructor(private readonly options: RateLimiterOptions) {
    if (options.maxAttempts < 1 || options.windowMs < 1) {
      throw new Error("INVALID_RATE_LIMIT_CONFIGURATION");
    }
  }

  consume(
    key: string,
    now = new Date(),
  ): { allowed: boolean; retryAfterMs: number } {
    const timestamp = now.getTime();
    const cutoff = timestamp - this.options.windowMs;
    const active = (this.#attempts.get(key) ?? []).filter(
      (attempt) => attempt > cutoff,
    );

    if (active.length >= this.options.maxAttempts) {
      const oldest = active[0] ?? timestamp;
      this.#attempts.set(key, active);
      return {
        allowed: false,
        retryAfterMs: Math.max(1, oldest + this.options.windowMs - timestamp),
      };
    }

    active.push(timestamp);
    this.#attempts.set(key, active);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.#attempts.delete(key);
  }
}
