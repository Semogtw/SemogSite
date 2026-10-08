import { describe, expect, it } from "vitest";
import { createSqliteApiRuntime } from "../src/composition/sqlite";

describe("SQLite site-admin API composition", () => {
  it("serves public content and denies anonymous private access", async () => {
    const runtime = createSqliteApiRuntime({ SEMOGTW_DATABASE_URL: ":memory:" });
    try {
      const publicResponse = await runtime.app.request("/api/v1/public/projects");
      await expect(publicResponse.json()).resolves.toEqual({ ok: true, data: [] });
      const audit = await runtime.app.request("/api/v1/private/audit");
      expect(audit.status).toBe(401);
      expect(audit.headers.get("cache-control")).toBe("no-store, private");
    } finally {
      runtime.close();
    }
  });
});
