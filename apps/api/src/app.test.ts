import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";

describe("Semogtw API", () => {
  it("exposes a minimal health response", async () => {
    const response = await createApiApp().request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "semogtw-api",
    });
  });

  it("accepts mounted resource roots with or without a trailing slash", async () => {
    const app = createApiApp();

    for (const path of [
      "/api/v1/public/projects",
      "/api/v1/public/projects/",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, data: [] });
    }
  });
});
