import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("private Growth routes", () => {
  it("mounts the owner-only overview with private reads and CSRF-backed writes", () => {
    const route = source("devos.growth.tsx");
    const server = source("../server/devos-growth.ts");

    expect(route).toContain('createFileRoute("/devos/growth")');
    expect(route).toContain("requireOwner");
    expect(route).toContain("getGrowthOverviewFn");
    expect(route).toContain("previewLearningGoalTemplateFn");
    expect(route).toContain("quickCreateLearningGoalFn");
    expect(route).toContain("readCookie(CSRF_COOKIE_NAME)");
    expect(route).toContain("GrowthPage");
    expect(route).toContain('content: "noindex, nofollow, noarchive"');
    expect(server).toContain("resolveCurrentOwner");
    expect(server).toContain("requireMutationOwner");
    expect(server).toContain("getNodeDatabase");
  });

  it("mounts a private detail route with server-derived weight rebalance", () => {
    const route = source("devos.growth.$goalId.tsx");
    const server = source("../server/devos-growth-weight-rebalance.ts");

    expect(route).toContain('createFileRoute("/devos/growth/$goalId")');
    expect(route).toContain("requireOwner");
    expect(route).toContain("getGrowthGoalFn");
    expect(route).toContain("previewGrowthWeightRebalanceFn");
    expect(route).toContain("applyGrowthWeightRebalanceFn");
    expect(route).toContain("readCookie(CSRF_COOKIE_NAME)");
    expect(route).toContain("GrowthWeightRebalance");
    expect(route).toContain("GrowthGoalDetail");
    expect(route).not.toContain("proposedWeights");
    expect(route).toContain('content: "noindex, nofollow, noarchive"');
    expect(server).not.toContain("weight: z.");
    expect(server).not.toContain("weightMode: z.");
  });

  it("loads Growth styles and exposes the workspace without losing mobile Roadmap access", () => {
    const root = source("__root.tsx");
    const more = source("devos.more.tsx");
    const sidebar = source(
      "../../../../packages/ui/src/navigation/devos-sidebar.tsx",
    );
    const bottomNav = source(
      "../../../../packages/ui/src/navigation/devos-bottom-nav.tsx",
    );

    expect(root).toContain('../styles/growth.css?url');
    expect(sidebar).toContain('{ href: "/devos/growth", label: "Growth"');
    expect(bottomNav).toContain('{ href: "/devos/growth", label: "Growth"');
    expect(more).toContain('to: "/devos/roadmap"');
  });
});
