import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "@semogtw/database/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createD1ApiRuntime } from "../src/composition/d1";

class NoopStatement implements D1PreparedStatementBinding {
  bind(..._values: readonly unknown[]): D1PreparedStatementBinding {
    return this;
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class NoopBinding implements D1DatabaseBinding {
  prepare(_query: string): D1PreparedStatementBinding {
    return new NoopStatement();
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    return statements.map(() => ({ results: [], success: true }));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("D1 request logging configuration", () => {
  it("is disabled by default and enabled only for an explicit truthy flag", async () => {
    const database = new NoopBinding();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const silentRuntime = await createD1ApiRuntime({ DB: database });
    const silentResponse = await silentRuntime.app.request("/health");
    expect(silentResponse.status).toBe(200);
    expect(info).not.toHaveBeenCalled();

    const loggedRuntime = await createD1ApiRuntime({
      DB: database,
      SEMOGTW_REQUEST_LOGGING: " true ",
    });
    expect(loggedRuntime).not.toBe(silentRuntime);

    const loggedResponse = await loggedRuntime.app.request("/health");
    expect(loggedResponse.status).toBe(200);
    expect(info).toHaveBeenCalledTimes(1);

    const payload = String(info.mock.calls[0]?.[0] ?? "");
    expect(JSON.parse(payload)).toMatchObject({
      event: "semogtw.api.request",
      method: "GET",
      scope: "health",
      status: 200,
      correlationId: expect.any(String),
      durationMs: expect.any(Number),
    });
  });

  it("treats unrecognized values as disabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runtime = await createD1ApiRuntime({
      DB: new NoopBinding(),
      SEMOGTW_REQUEST_LOGGING: "verbose",
    });

    await runtime.app.request("/health");
    expect(info).not.toHaveBeenCalled();
  });
});
