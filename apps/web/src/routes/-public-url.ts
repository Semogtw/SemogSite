const configuredOrigin = normalizeConfiguredPublicOrigin(
  import.meta.env.VITE_SEMOGTW_PUBLIC_ORIGIN,
);

export function normalizeConfiguredPublicOrigin(
  value: string | undefined | null,
): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("PUBLIC_ORIGIN_INVALID");
  }

  const isLoopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    url.hostname,
  );
  if (
    (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:")) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("PUBLIC_ORIGIN_INVALID");
  }

  return url.origin;
}

export function publicUrl(
  path: string,
  origin: string | null = configuredOrigin,
): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("PUBLIC_PATH_INVALID");
  }
  return origin === null ? path : `${origin}${path}`;
}

export function configuredPublicSiteOrigin(): string | null {
  return configuredOrigin;
}
