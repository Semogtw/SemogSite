import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

function expectBaselineSecurityHeaders(response: Response): void {
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("permissions-policy")).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
}

describe("API response security headers", () => {
  it("applies baseline headers and disables caching for liveness responses", async () => {
    const response = await createApiApp().request("https://api.example.test/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expectBaselineSecurityHeaders(response);
    expect(response.headers.get("cross-origin-resource-policy")).toBeNull();
  });

  it("marks auth responses as same-origin resources", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/auth/session",
    );

    expect(response.status).toBe(200);
    expectBaselineSecurityHeaders(response);
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
  });

  it("marks private failures as same-origin resources too", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/api/v1/private/overview",
    );

    expect(response.status).toBe(401);
    expectBaselineSecurityHeaders(response);
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
  });
});
