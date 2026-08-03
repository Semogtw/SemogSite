export type ScopeReservationKind =
  | "repository"
  | "directory"
  | "files"
  | "issue"
  | "stage"
  | "custom";

export type ScopeReservationState =
  | "active"
  | "released"
  | "transferred"
  | "overridden";

export type ScopeReservationSnapshot = {
  id: string;
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  branch: string;
  kind: ScopeReservationKind;
  patterns: readonly string[];
  holderLabel: string;
  purpose: string;
  state: ScopeReservationState;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  releasedAt: string | null;
  version: number;
};

export type ScopePatternNormalizationResult =
  | { ok: true; patterns: readonly string[] }
  | {
      ok: false;
      code: "SCOPE_PATTERN_REQUIRED" | "SCOPE_PATTERN_INVALID";
      pattern: string | null;
    };

export type ScopeReservationFreshness = {
  status: "active" | "expired" | "inactive";
  expiresAt: string;
};

export type ScopeReservationOverlapResult = {
  overlaps: boolean;
  reason: "REPOSITORY_SCOPE" | "PATH_SCOPE" | "IDENTITY_SCOPE" | null;
};

const maximumPatterns = 100;
const pathKinds = new Set<ScopeReservationKind>(["directory", "files"]);
const identityKinds = new Set<ScopeReservationKind>([
  "issue",
  "stage",
  "custom",
]);

function normalizeIso(value: string, errorCode: string): string {
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) throw new Error(errorCode);
  return new Date(epoch).toISOString();
}

function hasUnsafePathSegment(value: string): boolean {
  return value
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

function isSafePattern(value: string): boolean {
  if (value === "**") return true;
  if (value.length === 0 || value.length > 500) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  if (value.includes("\\") || value.includes("//")) return false;
  if (/\p{Cc}/u.test(value)) return false;
  if (value.includes("?") || value.includes("[") || value.includes("]")) {
    return false;
  }

  const directoryPattern = value.endsWith("/**");
  const path = directoryPattern ? value.slice(0, -3) : value;
  if (path.length === 0 || hasUnsafePathSegment(path)) return false;
  if (path.includes("*")) return false;
  return true;
}

export function normalizeScopePatterns(
  patterns: readonly string[],
): ScopePatternNormalizationResult {
  if (patterns.length === 0 || patterns.length > maximumPatterns) {
    return { ok: false, code: "SCOPE_PATTERN_REQUIRED", pattern: null };
  }

  const normalized = new Set<string>();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!isSafePattern(pattern)) {
      return { ok: false, code: "SCOPE_PATTERN_INVALID", pattern: rawPattern };
    }
    normalized.add(pattern);
  }

  return {
    ok: true,
    patterns: [...normalized].sort((left, right) => left.localeCompare(right)),
  };
}

export function deriveScopeReservationFreshness(
  reservation: ScopeReservationSnapshot,
  observedAtValue: string,
): ScopeReservationFreshness {
  const observedAt = normalizeIso(
    observedAtValue,
    "SCOPE_RESERVATION_OBSERVED_AT_INVALID",
  );
  const expiresAt = normalizeIso(
    reservation.expiresAt,
    "SCOPE_RESERVATION_EXPIRES_AT_INVALID",
  );

  if (reservation.state !== "active") {
    return { status: "inactive", expiresAt };
  }

  return {
    status:
      Date.parse(observedAt) >= Date.parse(expiresAt) ? "expired" : "active",
    expiresAt,
  };
}

type PathDescriptor =
  | { kind: "repository" }
  | { kind: "directory"; path: string }
  | { kind: "file"; path: string };

function describePath(pattern: string): PathDescriptor {
  if (pattern === "**") return { kind: "repository" };
  if (pattern.endsWith("/**")) {
    return { kind: "directory", path: pattern.slice(0, -3) };
  }
  return { kind: "file", path: pattern };
}

function directoryContains(directory: string, candidate: string): boolean {
  return candidate === directory || candidate.startsWith(`${directory}/`);
}

function pathDescriptorsOverlap(
  left: PathDescriptor,
  right: PathDescriptor,
): boolean {
  if (left.kind === "repository" || right.kind === "repository") return true;
  if (left.kind === "file" && right.kind === "file") {
    return left.path === right.path;
  }
  if (left.kind === "directory" && right.kind === "file") {
    return directoryContains(left.path, right.path);
  }
  if (left.kind === "file" && right.kind === "directory") {
    return directoryContains(right.path, left.path);
  }
  return (
    directoryContains(left.path, right.path) ||
    directoryContains(right.path, left.path)
  );
}

function normalizedPatterns(reservation: ScopeReservationSnapshot): readonly string[] {
  const normalized = normalizeScopePatterns(reservation.patterns);
  if (!normalized.ok) throw new Error("SCOPE_RESERVATION_PATTERNS_INVALID");
  return normalized.patterns;
}

export function scopeReservationsOverlap(
  left: ScopeReservationSnapshot,
  right: ScopeReservationSnapshot,
  observedAt: string,
): ScopeReservationOverlapResult {
  if (
    left.repositoryId !== right.repositoryId ||
    left.branch !== right.branch ||
    deriveScopeReservationFreshness(left, observedAt).status !== "active" ||
    deriveScopeReservationFreshness(right, observedAt).status !== "active"
  ) {
    return { overlaps: false, reason: null };
  }

  const leftPatterns = normalizedPatterns(left);
  const rightPatterns = normalizedPatterns(right);

  if (
    left.kind === "repository" ||
    right.kind === "repository" ||
    leftPatterns.includes("**") ||
    rightPatterns.includes("**")
  ) {
    return { overlaps: true, reason: "REPOSITORY_SCOPE" };
  }

  if (pathKinds.has(left.kind) && pathKinds.has(right.kind)) {
    const overlaps = leftPatterns.some((leftPattern) =>
      rightPatterns.some((rightPattern) =>
        pathDescriptorsOverlap(
          describePath(leftPattern),
          describePath(rightPattern),
        ),
      ),
    );
    return { overlaps, reason: overlaps ? "PATH_SCOPE" : null };
  }

  if (
    left.kind === right.kind &&
    identityKinds.has(left.kind) &&
    leftPatterns.some((pattern) => rightPatterns.includes(pattern))
  ) {
    return { overlaps: true, reason: "IDENTITY_SCOPE" };
  }

  return { overlaps: false, reason: null };
}
