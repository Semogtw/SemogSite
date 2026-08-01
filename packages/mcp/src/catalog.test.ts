import { describe, expect, it } from "vitest";
import {
  SEMOGTW_MCP_MAX_JSON_BYTES,
  SEMOGTW_MCP_READ_ANNOTATIONS,
  SEMOGTW_MCP_RESOURCES,
  SEMOGTW_MCP_TOOLS,
} from "./catalog";

describe("Semogtw MCP catalog", () => {
  it("defines a unique, immutable read-only catalog", () => {
    expect(SEMOGTW_MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "devos_get_overview",
      "devos_get_today",
      "devos_list_projects",
      "devos_get_project",
      "devos_query_roadmap",
    ]);
    expect(SEMOGTW_MCP_RESOURCES.map((resource) => resource.uri)).toEqual([
      "semogtw://devos/overview",
      "semogtw://devos/today",
      "semogtw://devos/projects",
      "semogtw://devos/roadmap",
    ]);

    expect(new Set(SEMOGTW_MCP_TOOLS.map((tool) => tool.name)).size).toBe(
      SEMOGTW_MCP_TOOLS.length,
    );
    expect(
      new Set(SEMOGTW_MCP_RESOURCES.map((resource) => resource.uri)).size,
    ).toBe(SEMOGTW_MCP_RESOURCES.length);
    expect(SEMOGTW_MCP_READ_ANNOTATIONS).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("contains no write-like operation and uses private Semogtw resource URIs", () => {
    for (const tool of SEMOGTW_MCP_TOOLS) {
      expect(tool.name).not.toMatch(
        /(?:create|update|delete|write|accept|complete|publish|sync|trigger)/u,
      );
      expect(tool.structuredKey.length).toBeGreaterThan(0);
    }
    for (const resource of SEMOGTW_MCP_RESOURCES) {
      expect(resource.uri).toMatch(/^semogtw:\/\/devos\/[a-z-]+$/u);
      expect(resource.mimeType).toBe("application/json");
    }
  });

  it("keeps the logical JSON limit at the reviewed 256 KiB boundary", () => {
    expect(SEMOGTW_MCP_MAX_JSON_BYTES).toBe(256 * 1024);
  });
});
