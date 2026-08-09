import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

function expectFailureHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("sanitized API failures", () => {
  it("returns a uniform no-store JSON 404 with correlation id", async () => {
    const response = await createApiApp().request(
      "https://api.example.test/missing-resource",
    );

    expect(response.status).toBe(404);
    expectFailureHeaders(response);
    const correlationId = response.headers.get("x-correlation-id");
    expect(correlationId).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Recurso não encontrado.",
        correlationId,
      },
    });
  });

  it("does not leak thrown details in 500 responses", async () => {
    const response = await createApiApp({
      publicProjects: {
        list: async () => {
          throw new Error("PRIVATE_DATABASE_MARKER");
        },
        findBySlug: async () => null,
      },
    }).request("https://api.example.test/api/v1/public/projects");

    expect(response.status).toBe(500);
    expectFailureHeaders(response);
    const correlationId = response.headers.get("x-correlation-id");
    expect(correlationId).toBeTruthy();
    const body = JSON.stringify(await response.json());
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).toContain(correlationId ?? "");
    expect(body).not.toContain("PRIVATE_DATABASE_MARKER");
  });
});
