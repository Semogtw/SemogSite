import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteApiRuntime } from "../src/composition/sqlite";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SQLite request logging configuration", () => {
  it("stays silent by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runtime = createSqliteApiRuntime({
      SEMOGTW_DATABASE_URL: ":memory:",
    });

    try {
      const response = await runtime.app.request("/health");
      expect(response.status).toBe(200);
      expect(info).not.toHaveBeenCalled();
    } finally {
      runtime.close();
    }
  });

  it("emits only the sanitized observation when explicitly enabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runtime = createSqliteApiRuntime({
      SEMOGTW_DATABASE_URL: ":memory:",
      SEMOGTW_REQUEST_LOGGING: "enabled",
    });

    try {
      const response = await runtime.app.request(
        "https://api.example.test/api/v1/public/projects?secret=PRIVATE_QUERY",
        { headers: { authorization: "Bearer PRIVATE_TOKEN" } },
      );
      expect(response.status).toBe(200);
      expect(info).toHaveBeenCalledTimes(1);

      const payload = String(info.mock.calls[0]?.[0] ?? "");
      expect(JSON.parse(payload)).toMatchObject({
        event: "semogtw.api.request",
        method: "GET",
        scope: "public",
        status: 200,
        correlationId: expect.any(String),
        durationMs: expect.any(Number),
      });
      expect(payload).not.toContain("PRIVATE_QUERY");
      expect(payload).not.toContain("PRIVATE_TOKEN");
    } finally {
      runtime.close();
    }
  });
});
