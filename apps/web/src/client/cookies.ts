export function readCookie(
  name: string,
  cookieHeader = typeof document === "undefined" ? "" : document.cookie,
): string | null {
  for (const part of cookieHeader.split(/;\s*/u)) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator) !== name) continue;

    const encodedValue = part.slice(separator + 1);
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return null;
    }
  }
  return null;
}
