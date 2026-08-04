import { distributeEqualIntegerWeights } from "./checkpoint-weights";
import type { CheckpointCompletionMode } from "./model";

export type LearningGoalTemplateId =
  | "learn_programming_language"
  | "complete_course"
  | "build_and_ship_project"
  | "prepare_for_exam"
  | "earn_credential";

export type LearningGoalTemplateCheckpoint = {
  key: string;
  title: string;
  description: string;
  required: boolean;
  completionMode: CheckpointCompletionMode;
};

export type LearningGoalTemplate = {
  id: LearningGoalTemplateId;
  version: 1;
  label: string;
  description: string;
  checkpoints: readonly LearningGoalTemplateCheckpoint[];
};

export type MaterializedLearningGoalTemplate = {
  templateId: LearningGoalTemplateId;
  templateVersion: 1;
  label: string;
  description: string;
  origin: {
    kind: "template";
    templateId: LearningGoalTemplateId;
    templateVersion: 1;
  };
  checkpoints: readonly (LearningGoalTemplateCheckpoint & {
    weight: number;
    weightMode: "automatic";
  })[];
};

function checkpoint(
  key: string,
  title: string,
  description: string,
): LearningGoalTemplateCheckpoint {
  return {
    key,
    title,
    description,
    required: true,
    completionMode: { kind: "binary" },
  };
}

const TEMPLATES: readonly LearningGoalTemplate[] = [
  {
    id: "learn_programming_language",
    version: 1,
    label: "Aprender uma linguagem de programação",
    description: "Do fundamento a um projeto aplicado com evidência final.",
    checkpoints: [
      checkpoint("fundamentals", "Fundamentos", "Sintaxe, tipos e conceitos centrais."),
      checkpoint("guided-practice", "Prática guiada", "Exercícios e exemplos progressivos."),
      checkpoint(
        "libraries-tools",
        "Bibliotecas e ferramentas",
        "Ecossistema, depuração e fluxo de trabalho.",
      ),
      checkpoint("applied-project", "Projeto aplicado", "Construir algo útil e demonstrável."),
      checkpoint(
        "review-evidence",
        "Revisão e evidência final",
        "Revisar lacunas e registrar a evidência de conclusão.",
      ),
    ],
  },
  {
    id: "complete_course",
    version: 1,
    label: "Concluir um curso",
    description: "Organizar materiais, conteúdo, exercícios e evidência final.",
    checkpoints: [
      checkpoint(
        "prepare-materials",
        "Preparar materiais e ambiente",
        "Reunir acessos, materiais e ferramentas necessárias.",
      ),
      checkpoint("complete-content", "Concluir conteúdo", "Percorrer os módulos previstos."),
      checkpoint(
        "exercises-assessments",
        "Exercícios e avaliações",
        "Concluir as atividades práticas e avaliações.",
      ),
      checkpoint(
        "apply-summarize",
        "Aplicação e resumo",
        "Aplicar o conteúdo e consolidar aprendizados.",
      ),
      checkpoint(
        "record-certificate",
        "Registrar certificado ou evidência",
        "Guardar a credencial ou outra evidência verificável.",
      ),
    ],
  },
  {
    id: "build_and_ship_project",
    version: 1,
    label: "Construir e entregar um projeto",
    description: "Do escopo inicial a uma entrega publicada e demonstrável.",
    checkpoints: [
      checkpoint("define-scope", "Definir escopo", "Delimitar resultado, restrições e não objetivos."),
      checkpoint("first-version", "Primeira versão", "Implementar uma versão funcional mínima."),
      checkpoint("tests", "Testes", "Validar comportamento e corrigir falhas relevantes."),
      checkpoint(
        "documentation-delivery",
        "Documentação e entrega",
        "Documentar uso, decisões e preparação da entrega.",
      ),
      checkpoint(
        "publish-present",
        "Publicar ou apresentar",
        "Disponibilizar o resultado e registrar a demonstração.",
      ),
    ],
  },
  {
    id: "prepare_for_exam",
    version: 1,
    label: "Preparar-se para uma prova",
    description: "Mapear conteúdo, praticar questões e revisar com simulado.",
    checkpoints: [
      checkpoint("map-content", "Mapear conteúdo", "Listar tópicos, pesos e lacunas."),
      checkpoint("fundamentals", "Fundamentos", "Revisar os conceitos essenciais."),
      checkpoint("questions", "Questões", "Resolver questões por tópico e dificuldade."),
      checkpoint("mock-exam", "Simulado", "Executar um simulado nas condições previstas."),
      checkpoint("review-exam", "Revisão e prova", "Revisar erros e realizar a avaliação."),
    ],
  },
  {
    id: "earn_credential",
    version: 1,
    label: "Obter uma credencial",
    description: "Cumprir requisitos, avaliação e verificação da credencial.",
    checkpoints: [
      checkpoint("requirements", "Requisitos", "Confirmar pré-requisitos, regras e prazos."),
      checkpoint(
        "mandatory-content",
        "Conteúdo obrigatório",
        "Concluir o conteúdo exigido pela credencial.",
      ),
      checkpoint("assessment", "Avaliação", "Realizar a avaliação ou entrega obrigatória."),
      checkpoint("receive-credential", "Receber credencial", "Obter o documento ou registro oficial."),
      checkpoint(
        "verify-record",
        "Verificar e registrar",
        "Confirmar autenticidade e guardar a evidência privada.",
      ),
    ],
  },
] as const;

export function listLearningGoalTemplates(): readonly LearningGoalTemplate[] {
  return TEMPLATES.map((template) => ({
    ...template,
    checkpoints: template.checkpoints.map((item) => ({
      ...item,
      completionMode: { ...item.completionMode },
    })),
  }));
}

export function materializeLearningGoalTemplate(
  templateId: LearningGoalTemplateId,
): MaterializedLearningGoalTemplate {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId);
  if (template === undefined) {
    throw new Error("LEARNING_GOAL_TEMPLATE_NOT_FOUND");
  }
  const weights = distributeEqualIntegerWeights(
    template.checkpoints.map((item) => item.key),
  );
  return {
    templateId: template.id,
    templateVersion: template.version,
    label: template.label,
    description: template.description,
    origin: {
      kind: "template",
      templateId: template.id,
      templateVersion: template.version,
    },
    checkpoints: template.checkpoints.map((item) => ({
      ...item,
      completionMode: { ...item.completionMode },
      weight: weights[item.key]!,
      weightMode: "automatic",
    })),
  };
}
