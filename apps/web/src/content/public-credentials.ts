export type PublicCredentialStatus = "in_progress" | "completed";

export type PublicCredentialKind =
  | "academic"
  | "professional_track"
  | "course"
  | "certification";

export type PublicCredential = {
  id: string;
  kind: PublicCredentialKind;
  title: string;
  issuer: string;
  status: PublicCredentialStatus;
  description: string;
  relatedSkills: readonly string[];
  completedAt?: string;
  verificationUrl?: string;
};

export const publicCredentials: readonly PublicCredential[] = [
  {
    id: "uesb-computer-science",
    kind: "academic",
    title: "Ciência da Computação",
    issuer: "UESB",
    status: "in_progress",
    description:
      "Graduação usada como base para aprofundar fundamentos de computação e conectar teoria com projetos de software.",
    relatedSkills: ["Fundamentos de computação", "Engenharia de software"],
  },
  {
    id: "datacamp-data-analyst",
    kind: "professional_track",
    title: "Trilha de Analista de Dados",
    issuer: "DataCamp",
    status: "in_progress",
    description:
      "Formação complementar voltada a desenvolver repertório prático para análise de dados e ampliar a atuação técnica.",
    relatedSkills: ["Análise de dados", "SQL", "Visualização"],
  },
];

export const credentialKindLabel: Record<PublicCredentialKind, string> = {
  academic: "Formação acadêmica",
  professional_track: "Trilha profissional",
  course: "Curso",
  certification: "Certificação",
};

export function listPublicCredentialsByStatus(
  status: PublicCredentialStatus,
): readonly PublicCredential[] {
  return publicCredentials.filter((credential) => credential.status === status);
}
