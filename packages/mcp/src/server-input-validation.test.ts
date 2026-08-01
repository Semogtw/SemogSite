import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

function recordingService(): SemogtwMcpReadService {
  return {
    getOverview: vi.fn(),
    getToday: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    queryRoadmap: vi.fn(),
  };
}

describe("Semogtw MCP protocol input validation", () => {
  it("rejects an oversized project slug before the read service", async () => {
    const service = recordingService();
    const server = createSemogtwMcpServer(service);
    const client = new Client({ name: "input-validation", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const marker = `super-secret-marker-${"x".repeat(200)}`;

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const result = await client.callTool({
        name: "devos_get_project",
        arguments: { slug: marker },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("super-secret-marker");
      expect(service.getProject).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects unbounded roadmap filters before the read service", async () => {
    const service = recordingService();
    const server = createSemogtwMcpServer(service);
    const client = new Client({ name: "filter-validation", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const projectIds = Array.from(
      { length: 51 },
      (_, index) => `super-secret-marker-${index}`,
    );

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const result = await client.callTool({
        name: "devos_query_roadmap",
        arguments: {
          projectIds,
          states: [],
          areas: [],
          includeCompleted: false,
        },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("super-secret-marker");
      expect(service.queryRoadmap).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
