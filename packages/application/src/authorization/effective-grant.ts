import { canonicalJson } from "../canonical-json";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  agentCapabilities,
  isAgentCapability,
  oauthScopeForCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { validateResourceSelectorForKind } from "./resource-selectors";
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
    if (!allowedKinds.has(resourceKind) || values === undefined || values.length === 0) {
      return false;
    }
    const seen = new Set<string>();
    for (const selector of values) {
      try {
        validateResourceSelectorForKind({
          resourceKind,
          selector,
          explicitOwnerSelection: selector.kind === "all",
        });
        const key = selectorKey(selector);
        if (seen.has(key)) continue;
        seen.add(key);
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
  const records = new Map<string, { value: Value; canonical: string; conflict: boolean }>();
  for (const value of values) {
    let canonical: string;
    try {
      canonical = canonicalJson(value as never);
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
    const bucket = target.get(resourceKind) ?? new Map<string, ResourceSelector>();
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

function selectorCoveredByBase(
  requested: ResourceSelector,
  base: readonly ResourceSelector[],
): boolean {
  if (base.some((selector) => selector.kind === "all")) return true;

  switch (requested.kind) {
    case "all":
      return false;
    case "exact_ids": {
      const allowed = new Set(
        base.flatMap((selector) =>
          selector.kind === "exact_ids" ? selector.ids : [],
        ),
      );
      return requested.ids.every((id) => allowed.has(id));
    }
    case "canonical_prefixes": {
      const allowed = base.flatMap((selector) =>
        selector.kind === "canonical_prefixes" ? selector.prefixes : [],
      );
      return requested.prefixes.every((prefix) =>
        allowed.some(
          (basePrefix) =>
            prefix === basePrefix || prefix.startsWith(`${basePrefix}/`),
        ),
      );
    }
    case "lifecycle_states": {
      const allowed = new Set(
        base.flatMap((selector) =>
          selector.kind === "lifecycle_states" ? selector.states : [],
        ),
      );
      return requested.states.every((state) => allowed.has(state));
    }
  }
}

function trustSessionEffective(input: {
  session: AgentTrustSession;
  ownerId: string;
  clientId: string;
  now: string;
  grantIds: ReadonlySet<string>;
  capabilitySelectors: Readonly<
    Partial<Record<AgentCapability, ResourceSelectorMap>>
  >;
  riskByCapability: Readonly<
    Partial<Record<AgentCapability, AgentRiskCeiling>>
  >;
}): boolean {
  const { session } = input;
  if (
    !bounded(session.id, 200) ||
    session.ownerId !== input.ownerId ||
    session.clientId !== input.clientId ||
    !isCanonicalUtcTimestamp(session.startsAt) ||
    !isCanonicalUtcTimestamp(session.expiresAt) ||
    session.startsAt > input.now ||
    session.expiresAt <= input.now ||
    session.startsAt >= session.expiresAt ||
    session.revokedAt !== null ||
    (session.riskCeiling !== "low" && session.riskCeiling !== "medium") ||
    !Number.isInteger(session.maxOperations) ||
    session.maxOperations < 1 ||
    session.maxOperations > 100 ||
    !Number.isInteger(session.operationsUsed) ||
    session.operationsUsed < 0 ||
    session.operationsUsed >= session.maxOperations ||
    !Number.isInteger(session.version) ||
    session.version < 1 ||
    !bounded(session.reason, 500) ||
    session.baseGrantIds.length < 1 ||
    new Set(session.baseGrantIds).size !== session.baseGrantIds.length ||
    !session.baseGrantIds.every((grantId) => input.grantIds.has(grantId)) ||
    session.capabilities.length < 1 ||
    new Set(session.capabilities).size !== session.capabilities.length
  ) {
    return false;
  }

  const requestedKinds = new Set<string>();
  for (const capability of session.capabilities) {
    if (!isAgentCapability(capability)) return false;
    const baseRisk = input.riskByCapability[capability];
    const baseSelectors = input.capabilitySelectors[capability];
    if (
      baseRisk === undefined ||
      baseSelectors === undefined ||
      riskRank[session.riskCeiling] > riskRank[baseRisk]
    ) {
      return false;
    }

    for (const resourceKind of resourceKindsForCapability(capability)) {
      requestedKinds.add(resourceKind);
      const requested = session.resourceSelectors[resourceKind];
      const allowed = baseSelectors[resourceKind];
      if (
        requested === undefined ||
        requested.length === 0 ||
        allowed === undefined ||
        requested.some((selector) => !selectorCoveredByBase(selector, allowed))
      ) {
        return false;
      }
    }
  }

  if (!validateSelectorMap(session.resourceSelectors, requestedKinds)) return false;
  return Object.keys(session.resourceSelectors).every((kind) =>
    requestedKinds.has(kind),
  );
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
      riskByCapability.set(
        capability,
        riskByCapability.has(capability)
          ? laterRisk(riskByCapability.get(capability) as AgentRiskCeiling, grant.riskCeiling)
          : grant.riskCeiling,
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
  const grantIdSet = new Set(grantIds);
  const trustSessionIds = uniqueRecordsById(input.trustSessions)
    .filter((session) =>
      trustSessionEffective({
        session,
        ownerId: input.ownerId,
        clientId: input.clientId,
        now: input.now,
        grantIds: grantIdSet,
        capabilitySelectors: capabilityResourceSelectors,
        riskByCapability: riskCeilingByCapability,
      }),
    )
    .map((session) => session.id);

  return {
    clientId: input.clientId,
    ownerId: input.ownerId,
    capabilities,
    resourceSelectors: selectorBucketsToMap(globalBuckets),
    capabilityResourceSelectors,
    riskCeiling,
    riskCeilingByCapability,
    grantIds,
    trustSessionIds,
  };
}
