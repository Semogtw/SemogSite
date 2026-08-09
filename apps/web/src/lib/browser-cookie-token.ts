function decodeCookieComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readBrowserCookie(
  cookieName: string,
  cookieSource: string,
): string | null {
  const normalizedName = cookieName.trim();
  if (normalizedName.length === 0) return null;

  for (const segment of cookieSource.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name !== normalizedName) continue;
    return decodeCookieComponent(segment.slice(separator + 1).trim());
  }
  return null;
}

/**
 * Returns a CSRF/token provider compatible with createPrivateApiClient without
 * coupling browser code to the authentication package or a hard-coded cookie
 * name. The caller owns the cookie name and can source it from the existing
 * auth/bootstrap contract.
 */
export function createBrowserCookieTokenProvider(
  cookieName: string,
  readCookieSource: () => string = () => document.cookie,
): () => string {
  return () => readBrowserCookie(cookieName, readCookieSource()) ?? "";
}
