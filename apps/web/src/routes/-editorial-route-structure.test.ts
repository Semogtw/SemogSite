import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("editorial route structure", () => {
  it("uses a layout outlet so document children replace the index page", () => {
    const layout = readFileSync(
      resolve(import.meta.dirname, "devos.content.tsx"),
      "utf8",
    );
    const index = readFileSync(
      resolve(import.meta.dirname, "devos.content.index.tsx"),
      "utf8",
    );

    expect(layout).toMatch(/\bOutlet\b/u);
    expect(layout).toContain('createFileRoute("/devos/content")');
    expect(index).toContain('createFileRoute("/devos/content/")');
  });
});
