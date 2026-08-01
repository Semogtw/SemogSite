import { z, type ZodType } from "zod";

export const GITHUB_API_VERSION = "2026-03-10";

export type GitHubClientErrorCode =
  | "INVALID_ARGUMENT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "API_VERSION_UNSUPPORTED"
  | "HTTP_FAILURE"
  | "INVALID_RESPONSE"
  | "TRANSPORT_FAILURE";

export class GitHubClientError extends Error {
  readonly code: GitHubClientErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly rateLimitResetAt: string | null;

  constructor(input: {
    code: GitHubClientErrorCode;
    status?: number;
    retryAfterSeconds?: number;
    rateLimitResetAt?: string | null;
  }) {
    super(input.code);
    this.name = "GitHubClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.rateLimitResetAt = input.rateLimitResetAt ?? null;
  }
}

export type GitHubRateLimit = {
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: string | null;
  resource: string | null;
  retryAfterSeconds: number | null;
};

export type GitHubResponseMeta = {
  etag: string | null;
  rateLimit: GitHubRateLimit;
};

export type GitHubResult<T> =
  | { status: "ok"; data: T; meta: GitHubResponseMeta }
  | { status: "not_modified"; meta: GitHubResponseMeta };

export type GitHubRepository = {
  nodeId: string;
  owner: string;
  name: string;
  fullName: string;
  visibility: "public" | "private";
  htmlUrl: string;
  defaultBranch: string;
  archived: boolean;
  pushedAt: string | null;
  updatedAt: string;
};

export type GitHubBranch = {
  name: string;
  headSha: string;
  protected: boolean;
};

export type GitHubBranchPage = {
  branches: readonly GitHubBranch[];
  truncated: boolean;
};

export type GitHubCommitObservation = {
  sha: string;
  committedAt: string;
};

export type GitHubRestClientOptions = {
  token?: string;
  apiVersion?: string;
  baseUrl?: string;
  userAgent?: string;
  fetcher?: typeof fetch;
};

const repositorySchema = z.object({
  node_id: z.string().min(1),
  name: z.string().min(1),
  full_name: z.string().min(3),
  private: z.boolean(),
  html_url: z.string().url(),
  default_branch: z.string().min(1),
  archived: z.boolean(),
  pushed_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
});

const branchListSchema = z.array(
  z.object({
    name: z.string().min(1),
    commit: z.object({ sha: z.string().min(1) }),
    protected: z.boolean(),
  }),
);

const commitSchema = z.object({
  sha: z.string().min(1),
  commit: z.object({
    author: z.object({ date: z.string().datetime().nullable() }).nullable(),
    committer: z.object({ date: z.string().datetime().nullable() }).nullable(),
  }),
});

function parseIntegerHeader(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochHeaderToIso(value: string | null): string | null {
  const epoch = parseIntegerHeader(value);
  if (epoch === null) return null;
  const date = new Date(epoch * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readMeta(headers: Headers): GitHubResponseMeta {
  return {
    etag: headers.get("etag"),
    rateLimit: {
      limit: parseIntegerHeader(headers.get("x-ratelimit-limit")),
      remaining: parseIntegerHeader(headers.get("x-ratelimit-remaining")),
      used: parseIntegerHeader(headers.get("x-ratelimit-used")),
      resetAt: epochHeaderToIso(headers.get("x-ratelimit-reset")),
      resource: headers.get("x-ratelimit-resource"),
      retryAfterSeconds: parseIntegerHeader(headers.get("retry-after")),
    },
  };
}

function encodeSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new GitHubClientError({ code: "INVALID_ARGUMENT" });
  }
  if (normalized.length > 255) {
    throw new GitHubClientError({ code: "INVALID_ARGUMENT" });
  }
  return encodeURIComponent(normalized);
}

export class GitHubRestClient {
  private readonly token: string | undefined;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GitHubRestClientOptions = {}) {
    this.token = options.token?.trim() || undefined;
    this.apiVersion = options.apiVersion?.trim() || GITHUB_API_VERSION;
    this.baseUrl = (options.baseUrl?.trim() || "https://api.github.com").replace(/\/$/u, "");
    this.userAgent = options.userAgent?.trim() || "Semogtw-DevOS";
    this.fetcher = options.fetcher ?? fetch;
  }

  async getRepository(
    owner: string,
    repository: string,
    options: { etag?: string } = {},
  ): Promise<GitHubResult<GitHubRepository>> {
    const result = await this.request(
      `/repos/${encodeSegment(owner, "owner")}/${encodeSegment(repository, "repository")}`,
      repositorySchema,
      options,
    );
    if (result.status === "not_modified") return result;

    const fullNameParts = result.data.full_name.split("/");
    return {
      status: "ok",
      data: {
        nodeId: result.data.node_id,
        owner: fullNameParts[0] ?? owner.trim(),
        name: result.data.name,
        fullName: result.data.full_name,
        visibility: result.data.private ? "private" : "public",
        htmlUrl: result.data.html_url,
        defaultBranch: result.data.default_branch,
        archived: result.data.archived,
        pushedAt: result.data.pushed_at
          ? new Date(result.data.pushed_at).toISOString()
          : null,
        updatedAt: new Date(result.data.updated_at).toISOString(),
      },
      meta: result.meta,
    };
  }

  async listBranches(
    owner: string,
    repository: string,
    maxBranches = 25,
    options: { etag?: string } = {},
  ): Promise<GitHubResult<GitHubBranchPage>> {
    if (!Number.isInteger(maxBranches) || maxBranches < 1 || maxBranches > 100) {
      throw new GitHubClientError({ code: "INVALID_ARGUMENT" });
    }
    const result = await this.request(
      `/repos/${encodeSegment(owner, "owner")}/${encodeSegment(repository, "repository")}/branches?per_page=${maxBranches}&page=1`,
      branchListSchema,
      options,
    );
    if (result.status === "not_modified") return result;
    return {
      status: "ok",
      data: {
        branches: result.data.map((branch) => ({
          name: branch.name,
          headSha: branch.commit.sha.toLowerCase(),
          protected: branch.protected,
        })),
        truncated: result.data.length >= maxBranches,
      },
      meta: result.meta,
    };
  }

  async getCommitObservation(
    owner: string,
    repository: string,
    ref: string,
    options: { etag?: string } = {},
  ): Promise<GitHubResult<GitHubCommitObservation>> {
    const result = await this.request(
      `/repos/${encodeSegment(owner, "owner")}/${encodeSegment(repository, "repository")}/commits/${encodeSegment(ref, "ref")}`,
      commitSchema,
      options,
    );
    if (result.status === "not_modified") return result;
    const committedAt =
      result.data.commit.committer?.date ?? result.data.commit.author?.date;
    if (!committedAt) {
      throw new GitHubClientError({ code: "INVALID_RESPONSE" });
    }
    return {
      status: "ok",
      data: {
        sha: result.data.sha.toLowerCase(),
        committedAt: new Date(committedAt).toISOString(),
      },
      meta: result.meta,
    };
  }

  private async request<T>(
    path: string,
    schema: ZodType<T>,
    options: { etag?: string },
  ): Promise<GitHubResult<T>> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": this.userAgent,
      "X-GitHub-Api-Version": this.apiVersion,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (options.etag?.trim()) headers["If-None-Match"] = options.etag.trim();

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "GET",
        headers,
        redirect: "follow",
      });
    } catch {
      throw new GitHubClientError({ code: "TRANSPORT_FAILURE" });
    }

    const meta = readMeta(response.headers);
    if (response.status === 304) return { status: "not_modified", meta };
    if (!response.ok) throw this.toHttpError(response.status, meta);

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new GitHubClientError({
        code: "INVALID_RESPONSE",
        status: response.status,
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new GitHubClientError({
        code: "INVALID_RESPONSE",
        status: response.status,
      });
    }
    return { status: "ok", data: parsed.data, meta };
  }

  private toHttpError(status: number, meta: GitHubResponseMeta): GitHubClientError {
    if (
      status === 429 ||
      (status === 403 &&
        (meta.rateLimit.remaining === 0 ||
          meta.rateLimit.retryAfterSeconds !== null))
    ) {
      return new GitHubClientError({
        code: "RATE_LIMITED",
        status,
        retryAfterSeconds: meta.rateLimit.retryAfterSeconds ?? undefined,
        rateLimitResetAt: meta.rateLimit.resetAt,
      });
    }
    if (status === 401) return new GitHubClientError({ code: "UNAUTHORIZED", status });
    if (status === 403) return new GitHubClientError({ code: "FORBIDDEN", status });
    if (status === 404) return new GitHubClientError({ code: "NOT_FOUND", status });
    if (status === 410) {
      return new GitHubClientError({ code: "API_VERSION_UNSUPPORTED", status });
    }
    return new GitHubClientError({ code: "HTTP_FAILURE", status });
  }
}
