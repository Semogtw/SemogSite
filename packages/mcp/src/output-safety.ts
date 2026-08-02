const exactSensitiveOutputKeys = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "apikey",
  "privatekey",
  "clientsecret",
  "sessionsecret",
  "secretkey",
  "credential",
  "credentials",
  "secrets",
  "sessiondigest",
  "tokendigest",
  "cookiedigest",
  "jwt",
  "sessionid",
  "authsessionid",
  "authorizationheader",
  "tokenvalue",
  "secretvalue",
  "passwordvalue",
]);

function isSensitiveOutputKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  return (
    normalized === "password" ||
    normalized.endsWith("password") ||
    normalized.endsWith("passwordhash") ||
    normalized.endsWith("passworddigest") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    exactSensitiveOutputKeys.has(normalized)
  );
}

export function containsSensitiveOutputKey(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveOutputKey(key)) return true;
    if (containsSensitiveOutputKey(child, seen)) return true;
  }
  return false;
}
