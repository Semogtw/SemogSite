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
});
