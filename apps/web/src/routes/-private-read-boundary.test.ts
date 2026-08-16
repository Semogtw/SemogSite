import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("canonical private read boundary", () => {
  it("reads overview and today from the D1-backed private API", () => {
    const overview = source("devos.index.tsx");
    const today = source("devos.today.tsx");

    expect(overview).toContain('privateDevos.read<DevOSOverview>("/api/v1/private/overview")');
    expect(today).toContain('privateDevos.read<TodayQueue>("/api/v1/private/today")');
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-overview.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-overview.server.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-today.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-today.server.ts"))).toBe(false);
  });
});
