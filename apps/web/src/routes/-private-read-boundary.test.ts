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

  it("reads roadmap and projects from the D1-backed private API", () => {
    const roadmap = source("devos.roadmap.tsx");
    const projects = source("devos.projects.index.tsx");
    const project = source("devos.projects.$slug.tsx");

    expect(roadmap).toContain('privateDevos.read<RoadmapResult>("/api/v1/private/roadmap")');
    expect(projects).toContain('privateDevos.read<OperationalPortfolio>("/api/v1/private/projects")');
    expect(project).toContain('privateDevos.read<ProjectHub>(');
    expect(project).toContain('error.code === "NOT_FOUND"');
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-roadmap.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-roadmap.server.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-projects.ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-projects.server.ts"))).toBe(false);
  });

  it("reads audit pages from the D1-backed private API", () => {
    const audit = source("devos.audit.tsx");

    expect(audit).toContain('privateDevos.read<AuditPageData>(');
    expect(audit).toContain('/api/v1/private/audit?${query.toString()}');
    expect(audit).toContain('query.set("action", action)');
    expect(audit).toContain('query.set("entityType", entityType)');
    expect(existsSync(resolve(import.meta.dirname, "../server/devos-audit.ts"))).toBe(false);
  });

});
