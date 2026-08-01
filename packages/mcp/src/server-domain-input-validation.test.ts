import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  DevOSReadService,
  type DevOSReadDependencies,
} from "@semogtw/domain";
import { describe, expect, it, vi } from "vitest";
import { createSemogtwMcpServer } from "./server";

function dependencies(): DevOSReadDependencies {
  return {
    overview: { getOverview: vi.fn() },
    today: { getQueue: vi.fn() },
    projects: {
      listOperationalPortfolio: vi.fn(),
      getProjectHub: vi.fn(),
    },
    roadmap: { query: vi.fn() },
  };
}

describe("Semogtw MCP domain input validation", () => {
  it("returns stable semantic errors without reaching read models", async () => {
    const deps = dependencies();
    const server = createSemogtwMcpServer(new DevOSReadService(deps));
    const client = new Client({ name: "domain-validation", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      await expect(
        client.callTool({
          name: "devos_get_project",
          arguments: { slug: "bad slug" },
        }),
      ).resolves.toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: { code: "PROJECT_INVALID_INPUT" },
            }),
          },
        ],
        isError: true,
      });
      expect(deps.projects.getProjectHub).not.toHaveBeenCalled();

      await expect(
        client.callTool({
          name: "devos_query_roadmap",
          arguments: {
            projectIds: ["bad id"],
            states: [],
            areas: [],
            includeCompleted: false,
          },
        }),
      ).resolves.toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: { code: "ROADMAP_INVALID_INPUT" },
            }),
          },
        ],
        isError: true,
      });
      expect(deps.roadmap.query).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
