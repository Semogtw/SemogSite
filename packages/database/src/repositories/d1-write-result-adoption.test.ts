import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryDirectory = dirname(fileURLToPath(import.meta.url));

const guardedRepositories = [
  "d1-attention-lifecycle-repository.ts",
  "d1-branch-recommendation-acceptance-repository.ts",
  "d1-cooperative-run-registration-repository.ts",
  "d1-cooperative-run-transition-repository.ts",
  "d1-editorial-redirect-repository.ts",
  "d1-repository-target-lifecycle-repository.ts",
  "d1-repository-target-registration-repository.ts",
  "d1-scope-reservation-repository.ts",
] as const;

describe("shared D1 write-result guard adoption", () => {
  it.each(guardedRepositories)("keeps %s on the shared guard", (fileName) => {
    const content = readFileSync(join(repositoryDirectory, fileName), "utf8");

    expect(content).toContain('from "./d1-write-result"');
    expect(content).not.toMatch(/function\s+assertBatchSucceeded\s*\(/u);
    expect(content).not.toMatch(/function\s+readChangeCount\s*\(/u);
    expect(content).toMatch(/readD1SingleRowChange\s*\(/u);
  });
});
