export type LogoutPolicyInput = {
  hasRawToken: boolean;
  hasCsrfCookie: boolean;
  ownerResolved: boolean;
  csrfValid: boolean;
};

export type LogoutDecision = {
  allowed: boolean;
  revoke: boolean;
  clearCookies: boolean;
};

/**
 * Allows stale or unknown sessions to clear local cookies, but requires a
 * session-bound CSRF proof before revoking a live server-side session.
 */
export function decideLogout(input: LogoutPolicyInput): LogoutDecision {
  if (!input.ownerResolved) {
    return { allowed: true, revoke: false, clearCookies: true };
  }

  if (!input.hasRawToken || !input.hasCsrfCookie || !input.csrfValid) {
    return { allowed: false, revoke: false, clearCookies: false };
  }

  return { allowed: true, revoke: true, clearCookies: true };
}
