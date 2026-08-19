type PublicStructuredData = Record<string, unknown>;

export function publicPortfolioHead({
  title,
  description,
  path,
  structuredData,
}: {
  title: string;
  description: string;
  path: string;
  structuredData?: PublicStructuredData;
}) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: path }],
    ...(structuredData === undefined
      ? {}
      : {
          scripts: [
            {
              type: "application/ld+json",
              children: JSON.stringify(structuredData).replace(/</gu, "\\u003c"),
            },
          ],
        }),
  };
}
