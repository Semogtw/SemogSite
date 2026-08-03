import { createHash } from "node:crypto";

export type EditorialContentInput = {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
};

export function normalizeEditorialTags(values: readonly string[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags;
}

export function parseEditorialTags(value: string): string[] {
  return normalizeEditorialTags(value.split(","));
}

export function computeEditorialContentHash(
  input: EditorialContentInput,
): string {
  const canonical = JSON.stringify({
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    bodyMarkdown: input.bodyMarkdown.trim(),
    tags: normalizeEditorialTags(input.tags),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
