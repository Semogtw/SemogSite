import { canonicalJson } from "../canonical-json";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import type { JsonValue } from "../core";
import {
  agentCapabilities,
  isAgentCapability,
  oauthScopeForCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { validateResourceSelectorForKind } from "./resource-selectors";
import { trustSessionFitsAuthorization } from "./trust-session";
import type {
  AgentCapability,
  AgentGrantDefinition,
  AgentRiskCeiling,
  AgentTrustSession,
  EffectiveAgentAuthorization,
  OAuthScope,
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

const riskRank: Readonly<Record<AgentRiskCeiling, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const knownOAuthScopes = new Set<OAuthScope>([
  "devos.read",
  "devos.write.attention",
  "devos.write.projects",
  "devos.write.roadmap",
  "devos.write.workflow",
  "devos.write.growth",
  "devos.write.editorial",
  "devos.write.appearance",
  "devos.admin.request",
  "devos.development.request",
]);

function bounded(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function riskKnown(value: string): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
}

function laterRisk(
  left: AgentRiskCeiling,
  right: AgentRiskCeiling,
): AgentRiskCeiling {
  return riskRank[left] >= riskRank[right] ? left : right;
}

function selectorKey(selector: ResourceSelector): string {
  return canonicalJson(selector);
}

function cloneSelector(selector: ResourceSelector): ResourceSelector {
  return JSON.parse(selectorKey(selector)) as ResourceSelector;
}

function validateSelectorMap(
  selectors: ResourceSelectorMap,
  allowedKinds: ReadonlySet<string>,
): boolean {
  const entries = Object.entries(selectors);
  if (entries.length === 0) return false;

  for (const [resourceKind, values] of entries) {
    if (
      !allowedKinds.has(resourceKind) ||
      values === undefined ||
      values.length === 0
    ) {
      return false;
    }
    for (const selector of values) {
      try {
        validateResourceSelectorForKind({
          resourceKind,
          selector,
          explicitOwnerSelection: selector.kind === "all",
        });
        selectorKey(selector);
      } catch {
        return false;
      }
    }
  }
  return true;
}

function grantActive(input: {
  grant: AgentGrantDefinition;
  ownerId: string;
  clientId: string;
  now: string;
}): boolean {
  const { grant } = input;
  if (
    !bounded(grant.id, 200) ||
    grant.ownerId !== input.ownerId ||
    grant.clientId !== input.clientId ||
    (grant.profileId !== null && !bounded(grant.profileId, 200)) ||
    grant.status !== "active" ||
    !Number.isInteger(grant.version) ||
    grant.version < 1 ||
    !riskKnown(grant.riskCeiling) ||
    !Array.isArray(grant.capabilities) ||
    grant.capabilities.length < 1 ||
    grant.capabilities.length > agentCapabilities.length ||
    grant.capabilities.some((capability) => !isAgentCapability(capability))
  ) {
    return false;
  }

  if (
    grant.expiresAt !== null &&
    (!isCanonicalUtcTimestamp(grant.expiresAt) || grant.expiresAt <= input.now)
  ) {
    return false;
  }

  const allowedKinds = new Set(
    grant.capabilities.flatMap((capability) =>
      resourceKindsForCapability(capability),
    ),
  );
  return validateSelectorMap(grant.resourceSelectors, allowedKinds);
}

function uniqueRecordsById<Value extends { id: string }>(
  values: readonly Value[],
): readonly Value[] {
  const records = new Map<
    string,
    { value: Value; canonical: string; conflict: boolean }
  >();
  for (const value of values) {
    let canonical: string;
    try {
      canonical = canonicalJson(value as unknown as JsonValue);
    } catch {
      continue;
    }
    const previous = records.get(value.id);
    if (previous === undefined) {
      records.set(value.id, { value, canonical, conflict: false });
    } else if (previous.canonical !== canonical) {
      previous.conflict = true;
    }
  }
  return [...records.values()]
    .filter((record) => !record.conflict)
    .map((record) => record.value)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function addSelectors(
  target: Map<string, Map<string, ResourceSelector>>,
  source: ResourceSelectorMap,
  allowedKinds: readonly string[],
): void {
  for (const resourceKind of allowedKinds) {
    const selectors = source[resourceKind];
    if (selectors === undefined) continue;
    const bucket =
      target.get(resourceKind) ?? new Map<string, ResourceSelector>();
    for (const selector of selectors) {
      bucket.set(selectorKey(selector), cloneSelector(selector));
    }
    target.set(resourceKind, bucket);
  }
}

function selectorBucketsToMap(
  buckets: ReadonlyMap<string, ReadonlyMap<string, ResourceSelector>>,
): ResourceSelectorMap {
  const result: Record<string, readonly ResourceSelector[]> = {};
  for (const resourceKind of [...buckets.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const values = buckets.get(resourceKind);
    if (values === undefined) continue;
    result[resourceKind] = [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([, selector]) => selector);
  }
  return result;
}

export function computeEffectiveAgentAuthorization(input: {
  ownerId: string;
  clientId: string;
  oauthScopes: readonly OAuthScope[];
  grants: readonly AgentGrantDefinition[];
  trustSessions: readonly AgentTrustSession[];
  now: string;
}): EffectiveAgentAuthorization | null {
  if (
    !bounded(input.ownerId, 200) ||
    !bounded(input.clientId, 200) ||
    !isCanonicalUtcTimestamp(input.now)
  ) {
    return null;
  }

  const scopes = new Set(
    input.oauthScopes.filter((scope) => knownOAuthScopes.has(scope)),
  );
  const grants = uniqueRecordsById(input.grants).filter((grant) =>
    grantActive({ ...input, grant }),
  );

  const selectorsByCapability = new Map<
    AgentCapability,
    Map<string, Map<string, ResourceSelector>>
  >();
  const riskByCapability = new Map<AgentCapability, AgentRiskCeiling>();
  const contributingGrantIds = new Set<string>();

  for (const grant of grants) {
    for (const capability of [...new Set(grant.capabilities)].sort()) {
      const requiredScope = oauthScopeForCapability(capability);
      if (!scopes.has(requiredScope)) continue;

      const resourceKinds = resourceKindsForCapability(capability);
      if (
        !resourceKinds.some(
          (resourceKind) =>
            (grant.resourceSelectors[resourceKind]?.length ?? 0) > 0,
        )
      ) {
        continue;
      }

      const buckets = selectorsByCapability.get(capability) ?? new Map();
      addSelectors(buckets, grant.resourceSelectors, resourceKinds);
      selectorsByCapability.set(capability, buckets);
      const previousRisk = riskByCapability.get(capability);
      riskByCapability.set(
        capability,
        previousRisk === undefined
          ? grant.riskCeiling
          : laterRisk(previousRisk, grant.riskCeiling),
      );
      contributingGrantIds.add(grant.id);
    }
  }

  const capabilities = [...selectorsByCapability.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (capabilities.length === 0) return null;

  const capabilityResourceSelectors: Partial<
    Record<AgentCapability, ResourceSelectorMap>
  > = {};
  const riskCeilingByCapability: Partial<
    Record<AgentCapability, AgentRiskCeiling>
  > = {};
  const globalBuckets = new Map<string, Map<string, ResourceSelector>>();
  let riskCeiling: AgentRiskCeiling = "low";

  for (const capability of capabilities) {
    const buckets = selectorsByCapability.get(capability);
    const risk = riskByCapability.get(capability);
    if (buckets === undefined || risk === undefined) continue;
    const selectorMap = selectorBucketsToMap(buckets);
    capabilityResourceSelectors[capability] = selectorMap;
    riskCeilingByCapability[capability] = risk;
    riskCeiling = laterRisk(riskCeiling, risk);
    addSelectors(globalBuckets, selectorMap, Object.keys(selectorMap));
  }

  const grantIds = [...contributingGrantIds].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const baseAuthorization: EffectiveAgentAuthorization = {
    clientId: input.clientId,
    ownerId: input.ownerId,
    capabilities,
    resourceSelectors: selectorBucketsToMap(globalBuckets),
    capabilityResourceSelectors,
    riskCeiling,
    riskCeilingByCapability,
    grantIds,
    trustSessionIds: [],
  };

  const trustSessionIds = uniqueRecordsById(input.trustSessions)
    .filter((session) =>
      trustSessionFitsAuthorization({
        session,
        baseAuthorization,
        now: input.now,
      }),
    )
    .map((session) => session.id);

  return { ...baseAuthorization, trustSessionIds };
}
