import { SESSION_COOKIE_NAME } from "@semogtw/auth";
import { getCookie } from "@tanstack/react-start/server";
import { getWebAuthProvider } from "./auth-runtime";
import { ensureWebAuthConfigured } from "./node-auth-composition.server";

export async function resolveCurrentOwner() {
  if (!(await ensureWebAuthConfigured())) return null;

  const provider = getWebAuthProvider();
  const rawToken = getCookie(SESSION_COOKIE_NAME);
  if (provider === null || rawToken === undefined) return null;
  return provider.resolveSession(rawToken);
}
