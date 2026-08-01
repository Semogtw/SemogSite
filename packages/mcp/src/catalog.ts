export const SEMOGTW_MCP_SERVER_INFO = {
  name: "semogtw-devos",
  version: "0.0.0",
} as const;

export const SEMOGTW_MCP_MAX_JSON_BYTES = 256 * 1024;

export const SEMOGTW_MCP_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const SEMOGTW_MCP_ERROR_CODES = [
  "DEVOS_READ_FAILED",
  "PROJECT_INVALID_INPUT",
  "PROJECT_NOT_FOUND",
  "ROADMAP_INVALID_INPUT",
  "RESULT_TOO_LARGE",
] as const;

export const SEMOGTW_MCP_TOOLS = [
  {
    name: "devos_get_overview",
    title: "Read DevOS overview",
    description:
      "Read the private Semogtw DevOS overview without changing operational state.",
    structuredKey: "overview",
  },
  {
    name: "devos_get_today",
    title: "Read today's DevOS queue",
    description:
      "Read current work, owner attention, external dependencies and recent activity.",
    structuredKey: "today",
  },
  {
    name: "devos_list_projects",
    title: "List operational projects",
    description: "Read the private operational project and repository catalog.",
    structuredKey: "projects",
  },
  {
    name: "devos_get_project",
    title: "Read a project hub",
    description: "Read one private project hub by its canonical DevOS slug.",
    structuredKey: "project",
  },
  {
    name: "devos_query_roadmap",
    title: "Query the operational roadmap",
    description: "Read roadmap items using bounded project, state and area filters.",
    structuredKey: "roadmap",
  },
] as const;

export const SEMOGTW_MCP_RESOURCES = [
  {
    name: "devos-overview",
    uri: "semogtw://devos/overview",
    title: "Semogtw DevOS overview",
    description: "Current private operational overview.",
    mimeType: "application/json",
  },
  {
    name: "devos-today",
    uri: "semogtw://devos/today",
    title: "Semogtw DevOS today queue",
    description: "Current private execution and attention queues.",
    mimeType: "application/json",
  },
  {
    name: "devos-projects",
    uri: "semogtw://devos/projects",
    title: "Semogtw DevOS project catalog",
    description: "Private operational project and repository catalog.",
    mimeType: "application/json",
  },
  {
    name: "devos-roadmap",
    uri: "semogtw://devos/roadmap",
    title: "Semogtw DevOS roadmap",
    description: "Private active roadmap without completed items by default.",
    mimeType: "application/json",
  },
] as const;

export type SemogtwMcpErrorCode =
  (typeof SEMOGTW_MCP_ERROR_CODES)[number];
export type SemogtwMcpToolName = (typeof SEMOGTW_MCP_TOOLS)[number]["name"];
export type SemogtwMcpResourceUri =
  (typeof SEMOGTW_MCP_RESOURCES)[number]["uri"];
