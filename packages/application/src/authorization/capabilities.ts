import type { AgentCapability, OAuthWriteScope } from "./types";

export const agentCapabilities = [
  "appearance.write",
  "attention.write",
  "development.request",
  "editorial.publish",
  "editorial.write",
  "growth.review",
  "growth.write",
  "integrations.request",
  "projects.write",
  "roadmap.write",
  "workflow.write",
] as const satisfies readonly AgentCapability[];

const agentCapabilitySet = new Set<string>(agentCapabilities);

const oauthScopesByCapability: Readonly<
  Record<AgentCapability, OAuthWriteScope>
> = {
  "appearance.write": "devos.write.appearance",
  "attention.write": "devos.write.attention",
  "development.request": "devos.development.request",
  "editorial.publish": "devos.write.editorial",
  "editorial.write": "devos.write.editorial",
  "growth.review": "devos.write.growth",
  "growth.write": "devos.write.growth",
  "integrations.request": "devos.admin.request",
  "projects.write": "devos.write.projects",
  "roadmap.write": "devos.write.roadmap",
  "workflow.write": "devos.write.workflow",
};

export function isAgentCapability(value: string): value is AgentCapability {
  return agentCapabilitySet.has(value);
}

export function capabilityForCommand(
  commandCapability: string,
): AgentCapability {
  if (!isAgentCapability(commandCapability)) {
    throw new Error("AGENT_CAPABILITY_UNKNOWN");
  }
  return commandCapability;
}

export function oauthScopeForCapability(
  capability: AgentCapability,
): OAuthWriteScope {
  return oauthScopesByCapability[capability];
}
