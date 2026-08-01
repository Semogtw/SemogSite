export type ObservationConfidence = "high" | "medium" | "low";

export type BranchObservation = {
  name: string;
  headSha: string;
  committedAt: string;
  protected: boolean;
};

export type BranchRecommendationEvidence = BranchObservation & {
  isDefault: boolean;
  isCurrentActive: boolean;
  ageHours: number;
};

export type BranchRecommendationInput = {
  defaultBranch: string;
  currentActiveBranch: string | null;
  branches: readonly BranchObservation[];
  observedAt: string;
  stabilityWindowHours?: number;
};

export type BranchRecommendation =
  | {
      status: "unavailable";
      confidence: "low";
      reason: string;
      warnings: readonly string[];
      evidence: readonly BranchRecommendationEvidence[];
    }
  | {
      status: "recommended";
      branch: string;
      confidence: ObservationConfidence;
      reason: string;
      warnings: readonly string[];
      evidence: readonly BranchRecommendationEvidence[];
    };

type NormalizedBranch = BranchObservation & {
  committedAtEpoch: number;
  isDefault: boolean;
  isCurrentActive: boolean;
  ageHours: number;
};

const oneHourMs = 60 * 60 * 1_000;
const highConfidenceGapMs = 24 * oneHourMs;
const headShaPattern = /^[0-9a-f]{7,64}$/u;

function isSafeBranchName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !/[\u0000-\u0020\u007f~^:?*[\\]/u.test(name) &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.startsWith(".") &&
    !name.endsWith(".") &&
    !name.endsWith(".lock") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.includes("//")
  );
}

function normalizeBranches(
  input: BranchRecommendationInput,
): { branches: NormalizedBranch[]; warnings: string[] } {
  const warnings: string[] = [];
  const observedAtEpoch = Date.parse(input.observedAt);
  const safeObservedAt = Number.isNaN(observedAtEpoch) ? 0 : observedAtEpoch;
  if (Number.isNaN(observedAtEpoch)) warnings.push("INVALID_OBSERVED_AT");

  const defaultBranch = input.defaultBranch.trim();
  const currentActiveBranch = input.currentActiveBranch?.trim() ?? null;
  const byName = new Map<string, NormalizedBranch>();

  for (const observation of input.branches) {
    const name = observation.name.trim();
    const headSha = observation.headSha.trim().toLowerCase();
    const committedAt = observation.committedAt.trim();
    if (!isSafeBranchName(name)) {
      warnings.push(
        name.length === 0 ? "INVALID_BRANCH_NAME" : `INVALID_BRANCH_NAME:${name}`,
      );
      continue;
    }
    if (!headShaPattern.test(headSha)) {
      warnings.push(`INVALID_HEAD_SHA:${name}`);
      continue;
    }
    const committedAtEpoch = Date.parse(committedAt);
    if (Number.isNaN(committedAtEpoch)) {
      warnings.push(`INVALID_COMMITTED_AT:${name}`);
      continue;
    }

    const normalized: NormalizedBranch = {
      name,
      headSha,
      committedAt: new Date(committedAtEpoch).toISOString(),
      protected: observation.protected,
      committedAtEpoch,
      isDefault: name === defaultBranch,
      isCurrentActive: name === currentActiveBranch,
      ageHours: Number.isNaN(observedAtEpoch)
        ? 0
        : Math.max(0, (safeObservedAt - committedAtEpoch) / oneHourMs),
    };
    const existing = byName.get(name);
    if (!existing || normalized.committedAtEpoch > existing.committedAtEpoch) {
      byName.set(name, normalized);
    }
  }

  return {
    branches: [...byName.values()].sort((left, right) => {
      const dateDifference = right.committedAtEpoch - left.committedAtEpoch;
      if (dateDifference !== 0) return dateDifference;
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.name.localeCompare(right.name);
    }),
    warnings,
  };
}

function toEvidence(branches: readonly NormalizedBranch[]): BranchRecommendationEvidence[] {
  return branches.map(({ committedAtEpoch: _committedAtEpoch, ...branch }) => branch);
}

export function recommendActiveBranch(
  input: BranchRecommendationInput,
): BranchRecommendation {
  const normalized = normalizeBranches(input);
  if (normalized.branches.length === 0) {
    return {
      status: "unavailable",
      confidence: "low",
      reason: "Nenhuma branch com head e data de commit válidos foi observada.",
      warnings: normalized.warnings,
      evidence: [],
    };
  }

  const newest = normalized.branches[0]!;
  const sameNewestHead = normalized.branches.filter(
    (branch) => branch.headSha === newest.headSha,
  );
  if (sameNewestHead.length > 1) {
    const defaultAlias = sameNewestHead.find((branch) => branch.isDefault);
    const currentAlias = sameNewestHead.find((branch) => branch.isCurrentActive);
    const selected = defaultAlias ?? currentAlias ?? sameNewestHead[0]!;
    return {
      status: "recommended",
      branch: selected.name,
      confidence: "low",
      reason: defaultAlias
        ? "A branch padrão compartilha o mesmo head mais recente com outras branches; não há evidência de uma linha de desenvolvimento distinta."
        : "Várias branches compartilham o mesmo head mais recente; a recomendação não representa uma linha de desenvolvimento distinta.",
      warnings: normalized.warnings,
      evidence: toEvidence(normalized.branches),
    };
  }

  const tiedNewest = normalized.branches.filter(
    (branch) => branch.committedAtEpoch === newest.committedAtEpoch,
  );
  if (tiedNewest.length > 1) {
    const selected = tiedNewest.find((branch) => branch.isDefault) ?? tiedNewest[0]!;
    return {
      status: "recommended",
      branch: selected.name,
      confidence: "low",
      reason: selected.isDefault
        ? "As branches líderes possuem a mesma data de commit; a branch padrão foi usada como desempate conservador."
        : "As branches líderes possuem a mesma data de commit; não há evidência suficiente para alta confiança.",
      warnings: normalized.warnings,
      evidence: toEvidence(normalized.branches),
    };
  }

  const stabilityWindowHours = Math.max(
    0,
    input.stabilityWindowHours ?? 72,
  );
  const current = normalized.branches.find((branch) => branch.isCurrentActive);
  if (
    current &&
    current.name !== newest.name &&
    newest.committedAtEpoch - current.committedAtEpoch <=
      stabilityWindowHours * oneHourMs
  ) {
    return {
      status: "recommended",
      branch: current.name,
      confidence: "medium",
      reason: `A branch ativa atual permanece dentro da janela de estabilidade de ${stabilityWindowHours} horas em relação ao head mais recente, evitando alternância por diferença pequena.`,
      warnings: normalized.warnings,
      evidence: toEvidence(normalized.branches),
    };
  }

  const runnerUp = normalized.branches[1];
  const gap = runnerUp
    ? newest.committedAtEpoch - runnerUp.committedAtEpoch
    : Number.POSITIVE_INFINITY;
  return {
    status: "recommended",
    branch: newest.name,
    confidence: gap > highConfidenceGapMs ? "high" : "medium",
    reason:
      gap > highConfidenceGapMs
        ? "Esta branch possui o head único mais recente e está mais de 24 horas à frente da próxima candidata observada."
        : "Esta branch possui o head único mais recente, mas a diferença para a próxima candidata é pequena.",
    warnings: normalized.warnings,
    evidence: toEvidence(normalized.branches),
  };
}
