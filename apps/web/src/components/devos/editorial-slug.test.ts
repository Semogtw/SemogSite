import { describe, expect, it } from "vitest";
import { slugifyEditorialTitle } from "./editorial-slug";

describe("slugifyEditorialTitle", () => {
  it("normalizes accents, punctuation and whitespace", () => {
    expect(slugifyEditorialTitle("Fichário Virtual: OCR & Busca Semântica")).toBe(
      "fichario-virtual-ocr-busca-semantica",
    );
  });

  it("keeps the result inside the editorial slug limit without trailing separators", () => {
    const slug = slugifyEditorialTitle(`${"projeto ".repeat(30)}final`);

    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u);
  });

  it("returns an empty suggestion when the title has no supported slug characters", () => {
    expect(slugifyEditorialTitle("--- !!! ---")).toBe("");
  });
});
