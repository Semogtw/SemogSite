import {
  CSRF_COOKIE_NAME,
  verifyCsrfToken,
  type AuthenticatedOwner,
} from "@semogtw/auth";
import { getCookie } from "@tanstack/react-start/server";
import { getWebSessionSecret } from "./auth-runtime";
import { resolveCurrentOwner } from "./current-owner.server";
import { decideMutationAuthorization } from "./mutation-policy";

export async function requireMutationOwner(
  submittedCsrfToken: string,
): Promise<AuthenticatedOwner | null> {
  const owner = await resolveCurrentOwner();
  const secret = getWebSessionSecret();
  const cookieToken = getCookie(CSRF_COOKIE_NAME);
  const csrfValid =
    owner !== null && secret !== null && cookieToken !== undefined
      ? await verifyCsrfToken(
          secret,
          owner.sessionId,
          cookieToken,
          submittedCsrfToken,
        )
      : false;
  const decision = decideMutationAuthorization({
    ownerResolved: owner !== null,
    csrfValid,
  });
  return decision.allowed ? owner : null;
}
