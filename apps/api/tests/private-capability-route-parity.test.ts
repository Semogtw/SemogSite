import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";
import { privateStateWriteCapabilities } from "../src/private-capability-registry";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS", "ALL"]);

function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

describe("private capability registry route parity", () => {
  it("has a concrete Hono route for every registered state write", () => {
    const app = createApiApp();
    const concreteRoutes = new Set(
      app.routes
        .filter((route) => route.method !== "ALL")
        .map((route) => key(route.method, route.path)),
    );

    for (const capability of privateStateWriteCapabilities) {
      expect(
        concreteRoutes.has(key(capability.method, capability.path)),
        `${capability.name} must resolve to ${capability.method} ${capability.path}`,
      ).toBe(true);
    }
  });

  it("does not mount an unsafe private handler outside the registry", () => {
    const app = createApiApp();
    const registered = new Set(
      privateStateWriteCapabilities.map((capability) =>
        key(capability.method, capability.path),
      ),
    );

    const unregistered = app.routes
      .filter(
        (route) =>
          route.path.startsWith("/api/v1/private/") &&
          !safeMethods.has(route.method.toUpperCase()),
      )
      .map((route) => key(route.method, route.path))
      .filter((routeKey) => !registered.has(routeKey));

    expect([...new Set(unregistered)].sort()).toEqual([]);
  });

  it("keeps every registered path canonical without a trailing slash", () => {
    for (const capability of privateStateWriteCapabilities) {
      expect(capability.path.endsWith("/")).toBe(false);
      expect(capability.path).toBe(normalizePath(capability.path));
    }
  });
});
