import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

function readService(): SemogtwMcpReadService {
  return {
    getOverview: vi.fn().mockResolvedValue({
      activeProjectCount: 1,
      inProgressStageCount: 1,
      highImpactAttentionCount: 0,
      projects: [],
      currentStages: [],
      attention: [],
      lastSyncedAt: null,
    }),
    getToday: vi.fn().mockResolvedValue({
      executeNow: [],
      nextInQueue: [],
      needsOwner: [],
      externalDependencies: [],
      recentActivity: [],
    }),
    listProjects: vi.fn().mockResolvedValue({
      activeProjects: [
        {
          id: "project-1",
          slug: "semog-site",
          name: "SemogSite",
          status: "active",
          health: "healthy",
          priority: "high",
          progressEstimate: 50,
          focus: "MCP read adapter",
          nextAction: "Verify protocol bridge",
          branchSummary: "develop/foundation-bootstrap",
          confidence: "high",
          lastActivityAt: null,
          lastSyncedAt: null,
        },
      ],
      activeRepositories: [],
      repositoryCatalog: [],
    }),
    getProject: vi.fn().mockImplementation(async (slug: string) =>
      slug === "semog-site"
        ? {
            ok: true as const,
            data: {
              project: {
                id: "project-1",
                slug,
                name: "SemogSite",
                status: "active",
                health: "healthy",
                priority: "high",
                progressEstimate: 50,
                focus: "MCP read adapter",
                nextAction: "Verify protocol bridge",
                branchSummary: "develop/foundation-bootstrap",
                confidence: "high",
                lastActivityAt: null,
                lastSyncedAt: null,
              },
              repositories: [],
              currentStages: [],
              attention: [],
              evidence: [],
              recentSessions: [],
              nextGate: null,
              safetyConstraint: null,
              dataSource: "manual",
              updatedAt: "2026-08-01T20:00:00.000Z",
            },
          }
        : { ok: false as const, code: "NOT_FOUND" as const },
    ),
    queryRoadmap: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        items: [],
        board: {
          backlog: [],
          next: [],
          in_progress: [],
          blocked: [],
          completed: [],
        },
      },
    }),
  };
}

type Connected = {
  client: Client;
  server: ReturnType<typeof createSemogtwMcpServer>;
};

const connected: Connected[] = [];

async function connect(service = readService()): Promise<Connected> {
  const server = createSemogtwMcpServer(service);
  const client = new Client({ name: "semogtw-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  const pair = { client, server };
  connected.push(pair);
  return pair;
}

afterEach(async () => {
  for (const pair of connected.splice(0)) {
    await pair.client.close();
    await pair.server.close();
  }
});

describe("Semogtw MCP read adapter", () => {
  it("publishes only the expected read-only tools and resources", async () => {
    const { client } = await connect();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "devos_get_overview",
      "devos_get_today",
      "devos_list_projects",
      "devos_get_project",
      "devos_query_roadmap",
    ]);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.name).not.toMatch(/create|update|delete|write|accept|complete/u);
    }

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual([
      "semogtw://devos/overview",
      "semogtw://devos/today",
      "semogtw://devos/projects",
      "semogtw://devos/roadmap",
    ]);
    expect(resources.resources.every((resource) => resource.mimeType === "application/json")).toBe(true);
  });

  it("returns text and structured content for successful tools", async () => {
    const service = readService();
    const { client } = await connect(service);

    const overview = await client.callTool({
      name: "devos_get_overview",
      arguments: {},
    });
    expect(overview.isError).not.toBe(true);
    expect(overview.structuredContent).toEqual({
      overview: expect.objectContaining({ activeProjectCount: 1 }),
    });
    expect(overview.content).toEqual([
      expect.objectContaining({ type: "text" }),
    ]);

    const project = await client.callTool({
      name: "devos_get_project",
      arguments: { slug: "semog-site" },
    });
    expect(project.structuredContent).toEqual({
      project: expect.objectContaining({
        project: expect.objectContaining({ slug: "semog-site" }),
      }),
    });
    expect(service.getProject).toHaveBeenCalledWith("semog-site");

    const roadmap = await client.callTool({
      name: "devos_query_roadmap",
      arguments: {
        projectIds: ["project-1"],
        states: ["in_progress"],
        areas: ["implementation"],
        includeCompleted: false,
      },
    });
    expect(roadmap.isError).not.toBe(true);
    expect(service.queryRoadmap).toHaveBeenCalledWith({
      projectIds: ["project-1"],
      states: ["in_progress"],
      areas: ["implementation"],
      includeCompleted: false,
    });
  });

  it("maps project not-found to a stable tool error", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "devos_get_project",
      arguments: { slug: "missing" },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ ok: false, error: { code: "PROJECT_NOT_FOUND" } }),
      },
    ]);
  });

  it("reads static JSON resources through the same service", async () => {
    const { client } = await connect();

    const result = await client.readResource({
      uri: "semogtw://devos/projects",
    });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({
      uri: "semogtw://devos/projects",
      mimeType: "application/json",
    });
    expect(JSON.parse(result.contents[0]!.text!)).toMatchObject({
      ok: true,
      data: { activeProjects: [{ slug: "semog-site" }] },
    });
  });

  it("sanitizes unexpected tool and resource failures", async () => {
    const service = readService();
    vi.mocked(service.getToday).mockRejectedValue(
      new Error("database password=do-not-expose"),
    );
    vi.mocked(service.getOverview).mockRejectedValue(
      new Error("token=do-not-expose"),
    );
    const { client } = await connect(service);

    const tool = await client.callTool({
      name: "devos_get_today",
      arguments: {},
    });
    expect(tool.isError).toBe(true);
    expect(JSON.stringify(tool)).not.toContain("do-not-expose");
    expect(tool.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ ok: false, error: { code: "DEVOS_READ_FAILED" } }),
      },
    ]);

    const resource = await client.readResource({
      uri: "semogtw://devos/overview",
    });
    expect(JSON.stringify(resource)).not.toContain("do-not-expose");
    expect(JSON.parse(resource.contents[0]!.text!)).toEqual({
      ok: false,
      error: { code: "DEVOS_READ_FAILED" },
    });
  });
});
