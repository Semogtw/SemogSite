export const agentRiskCeilings = ["low", "medium", "high"] as const;
export type AgentRiskCeiling = (typeof agentRiskCeilings)[number];

export const agentGrantStatuses = [
  "active",
  "suspended",
  "revoked",
  "expired",
] as const;
export type AgentGrantStatus = (typeof agentGrantStatuses)[number];

export type AgentCapability =
  | "attention.write"
  | "projects.write"
  | "roadmap.write"
  | "workflow.write"
  | "growth.write"
  | "growth.review"
  | "editorial.write"
  | "editorial.publish"
  | "appearance.write"
  | "integrations.request"
  | "development.request";

export type OAuthWriteScope =
  | "devos.write.attention"
  | "devos.write.projects"
  | "devos.write.roadmap"
  | "devos.write.workflow"
  | "devos.write.growth"
  | "devos.write.editorial"
  | "devos.write.appearance"
  | "devos.admin.request"
  | "devos.development.request";

export type ResourceSelector =
  | { kind: "all" }
  | { kind: "exact_ids"; ids: readonly string[] }
  | { kind: "canonical_prefixes"; prefixes: readonly string[] }
  | { kind: "lifecycle_states"; states: readonly string[] };

export type CommandResourceParentRef = {
  kind: string;
  id: string;
};

export type CommandResource = {
  kind: string;
  id: string;
  parentRefs: readonly CommandResourceParentRef[];
  lifecycleState: string | null;
};

export type AgentGrantDefinition = {
  id: string;
  ownerId: string;
  clientId: string;
  profileId: string | null;
  status: AgentGrantStatus;
  capabilities: readonly AgentCapability[];
  resourceSelectors: Readonly<
    Record<string, readonly ResourceSelector[] | undefined>
  >;
  riskCeiling: AgentRiskCeiling;
  expiresAt: string | null;
  version: number;
};
