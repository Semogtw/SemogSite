import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "@semogtw/database";
import { describe, expect, it } from "vitest";
import { createD1ApiApp } from "../src/composition/d1";
import worker from "../src/worker";

const projectValues: readonly unknown[] = [
  "public-project",
  "public-project",
  "Projeto público",
  null,
  "active",
  "healthy",
  "high",
  80,
  "PRIVATE_FOCUS",
  "PRIVATE_NEXT_ACTION",
  "private/branch",
  "PRIVATE_STATUS_BASIS",
  "high",
  "public",
  "Resumo público.",
  "PRIVATE_SUMMARY",
  75,
  1,
  null,
  "https://example.com",
  null,
  "2026-08-01T12:00:00.000Z",
  null,
  0,
  "manual",
  "2026-08-01T12:00:00.000Z",
  "2026-08-01T12:00:00.000Z",
];

class PublicProjectStatement implements D1PreparedStatementBinding {
  constructor(private readonly params: readonly unknown[] = []) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new PublicProjectStatement(values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    const slug = this.params.length > 1 ? this.params[0] : "public-project";
    return (slug === "public-project" ? [projectValues] : []) as unknown as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class PublicProjectBinding implements D1DatabaseBinding {
  prepare(): D1PreparedStatementBinding {
    return new PublicProjectStatement();
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }
}

describe("D1 API composition", () => {
  it("serves public projects from D1 and keeps private routes closed", async () => {
    const app = createD1ApiApp({ DB: new PublicProjectBinding() });

    const publicResponse = await app.request("/api/v1/public/projects");
    expect(publicResponse.status).toBe(200);
    await expect(publicResponse.json()).resolves.toEqual({
      ok: true,
      data: [
        {
          slug: "public-project",
          name: "Projeto público",
          publicSummary: "Resumo público.",
          publicProgress: 75,
          featured: true,
          liveUrl: "https://example.com",
          documentationUrl: null,
          lastPublicActivityAt: null,
        },
      ],
    });

    const privateResponse = await app.request("/api/v1/private/overview");
    expect(privateResponse.status).toBe(401);
    expect(privateResponse.headers.get("cache-control")).toBe(
      "no-store, private",
    );
  });

  it("exposes a standard module Worker fetch entry", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/health"),
      { DB: new PublicProjectBinding() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "semogtw-api",
    });
  });
});
