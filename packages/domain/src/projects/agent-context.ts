import type { Confidence } from "../shared/types";

export type AgentContextInput = {
  projectName: string;
  purpose: string;
  recordedBranch: string | null;
  currentState: string;
  activeStages: readonly string[];
  nextActions: readonly string[];
  blockers: readonly string[];
  testsPassed: readonly string[];
  testsNotRun: readonly string[];
  links: readonly string[];
  safetyConstraints: readonly string[];
  updatedAt: string;
  confidence: Confidence;
};

const secretPatterns = [
  /ghp_[a-zA-Z0-9_]+/gu,
  /github_pat_[a-zA-Z0-9_]+/gu,
  /sk-[a-zA-Z0-9_-]+/gu,
  /bearer\s+[a-zA-Z0-9._~+/=-]+/giu,
  /PRIVATE_SOURCE_CODE/gu,
  /(?:token|secret|password)\s*[=:]\s*\S+/giu,
];

function sanitize(value: string): string {
  let result = value;
  for (const pattern of secretPatterns) result = result.replace(pattern, "[redigido]");
  return result.replace(/\s+/gu, " ").trim();
}

function section(title: string, items: readonly string[]): string[] {
  const sanitized = items.map(sanitize).filter((item) => item.length > 0);
  return [title, ...(sanitized.length > 0 ? sanitized.map((item) => `- ${item}`) : ["- Nenhum registro."])];
}

export function buildAgentContext(input: AgentContextInput): string {
  const lines = [
    `# Contexto do projeto: ${sanitize(input.projectName)}`,
    "",
    `Propósito: ${sanitize(input.purpose)}`,
    `Branch registrada: ${sanitize(input.recordedBranch ?? "não definida")}`,
    `Estado atual: ${sanitize(input.currentState)}`,
    `Confiança: ${input.confidence}`,
    `Informação atualizada em: ${sanitize(input.updatedAt)} (America/Bahia na apresentação)`,
    "",
    ...section("## Etapas ativas", input.activeStages),
    "",
    ...section("## Próximo passo:", input.nextActions),
    "",
    ...section("## Bloqueios", input.blockers),
    "",
    ...section("## Testes aprovados", input.testsPassed),
    "",
    ...section("## Testes não executados", input.testsNotRun),
    "",
    ...section("## Links essenciais", input.links),
    "",
    ...section("## Restrições de segurança", input.safetyConstraints),
  ];

  const output = lines.join("\n");
  if (output.length <= 6_000) return output;
  return `${output.slice(0, 5_940)}\n\n[Contexto truncado com segurança]`;
}
