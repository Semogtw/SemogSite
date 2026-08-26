import { publicUrl } from "./-public-url";

type PublicEditorialKind = "note" | "project";

type PublicHeadDocument = {
  title: string;
  excerpt: string;
};

const config = {
  note: {
    basePath: "/notes",
    listTitle: "Notas — Semogtw",
    listDescription:
      "Notas técnicas, decisões, retrospectivas e tutoriais publicados pela Semogtw.",
    missingTitle: (slug: string) => `Nota ${slug} — Semogtw`,
    missingDescription: "Nota técnica ainda não publicada.",
  },
  project: {
    basePath: "/projects",
    listTitle: "Projetos — Semogtw",
    listDescription:
      "Case studies de projetos da Semogtw com contexto, decisões técnicas, verificações e resultados publicados após revisão editorial explícita.",
    missingTitle: (slug: string) => `Projeto ${slug} — Semogtw`,
    missingDescription: "Projeto ainda não publicado na vitrine editorial.",
  },
} satisfies Record<
  PublicEditorialKind,
  {
    basePath: string;
    listTitle: string;
    listDescription: string;
    missingTitle: (slug: string) => string;
    missingDescription: string;
  }
>;

function socialMeta(
  title: string,
  description: string,
  type: "website" | "article",
  url: string,
) {
  return [
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

export function publicEditorialListHead(
  kind: PublicEditorialKind,
  options: { index?: boolean } = {},
) {
  const value = config[kind];
  const canonicalUrl = publicUrl(value.basePath);
  return {
    meta: [
      { title: value.listTitle },
      { name: "description", content: value.listDescription },
      ...(options.index === false
        ? [{ name: "robots", content: "noindex, follow" }]
        : []),
      ...socialMeta(
        value.listTitle,
        value.listDescription,
        "website",
        canonicalUrl,
      ),
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}

export function publicEditorialDetailHead({
  kind,
  slug,
  document,
}: {
  kind: PublicEditorialKind;
  slug: string;
  document: PublicHeadDocument | null;
}) {
  const value = config[kind];
  if (document === null) {
    return {
      meta: [
        { title: value.missingTitle(slug) },
        { name: "robots", content: "noindex, nofollow" },
        { name: "description", content: value.missingDescription },
      ],
      links: [],
    };
  }

  const title = `${document.title} — Semogtw`;
  const canonicalUrl = publicUrl(`${value.basePath}/${slug}`);
  return {
    meta: [
      { title },
      { name: "description", content: document.excerpt },
      ...socialMeta(title, document.excerpt, "article", canonicalUrl),
    ],
    links: [
      {
        rel: "canonical",
        href: canonicalUrl,
      },
    ],
  };
}
