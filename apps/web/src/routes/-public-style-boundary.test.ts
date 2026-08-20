import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRoute(name: string) {
  return readFileSync(resolve(import.meta.dirname, name), "utf8");
}

describe("public stylesheet boundary", () => {
  it("keeps private and route-specific styles out of the root document", () => {
    const root = readRoute("__root.tsx");

    expect(root).toContain('../styles/public-surfaces.css?url');
    expect(root).toContain('../styles/portfolio.css?url');

    for (const stylesheet of [
      "audit.css",
      "capture.css",
      "contact.css",
      "credentials.css",
      "devos-core.css",
      "editorial.css",
      "editorial-portfolio.css",
      "evidence.css",
      "github-sync.css",
      "journey.css",
      "login.css",
      "project-case-study.css",
      "public-editorial.css",
      "public-projects.css",
      "repository-target-lifecycle.css",
      "repository-target.css",
      "roadmap.css",
      "runs.css",
      "skills.css",
      "stage-completion.css",
    ]) {
      expect(root).not.toContain(stylesheet);
    }
  });

  it("keeps private core and login styles attached to their private routes", () => {
    const devos = readRoute("devos.tsx");
    const login = readRoute("devos.login.tsx");

    expect(devos).toContain('../styles/devos-core.css?url');
    expect(login).toContain('../styles/login.css?url');
  });

  it("keeps public feature styles attached to the routes that consume them", () => {
    expect(readRoute("stack.tsx")).toContain('../styles/skills.css?url');
    expect(readRoute("credentials.tsx")).toContain('../styles/credentials.css?url');
    expect(readRoute("contact.tsx")).toContain('../styles/contact.css?url');
    expect(readRoute("projects.$slug.tsx")).toContain(
      '../styles/project-case-study.css?url',
    );
  });
});
