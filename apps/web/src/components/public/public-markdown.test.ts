import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicMarkdown } from "./public-markdown";

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(PublicMarkdown, { markdown }));
}

describe("PublicMarkdown", () => {
  it("renders the reviewed markdown subset without injecting raw HTML", () => {
    const html = render([
      "# Título público",
      "",
      "Texto com **ênfase forte**, *ênfase* e `código`.",
      "",
      "- Primeiro item",
      "- Segundo item",
      "",
      "```ts",
      "const value = '<script>alert(1)</script>';",
      "```",
      "",
      "<script>alert('raw')</script>",
    ].join("\n"));

    expect(html).toContain("<h1>Título público</h1>");
    expect(html).toContain("<strong>ênfase forte</strong>");
    expect(html).toContain("<em>ênfase</em>");
    expect(html).toContain("<code>código</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain('data-language="ts"');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("allows only reviewed relative, fragment and HTTPS links", () => {
    const html = render([
      "[Interno](/projects/semogtw)",
      "[Âncora](#arquitetura)",
      "[Externo](https://example.com/docs)",
      "[Inseguro](javascript:alert(1))",
      "[Protocolo relativo](//evil.example)",
      "[HTTP](http://example.com)",
    ].join("\n\n"));

    expect(html).toContain('href="/projects/semogtw"');
    expect(html).toContain('href="#arquitetura"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="//evil.example"');
    expect(html).not.toContain('href="http://example.com"');
    expect(html).toContain("Inseguro");
    expect(html).toContain("Protocolo relativo");
    expect(html).toContain("HTTP");
  });

  it("renders reviewed project media without allowing unsafe image sources", () => {
    const html = render([
      "![Tela do projeto](/media/semogsite-home.webp)",
      "",
      "![Diagrama](https://images.example.com/architecture.png)",
      "",
      "![Insegura](javascript:alert(1))",
      "",
      "![HTTP](http://images.example.com/screenshot.png)",
      "",
      "![](https://images.example.com/no-alt.png)",
    ].join("\n"));

    expect(html).toContain('src="/media/semogsite-home.webp"');
    expect(html).toContain('alt="Tela do projeto"');
    expect(html).toContain('src="https://images.example.com/architecture.png"');
    expect(html).toContain('alt="Diagrama"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('src="http://images.example.com/screenshot.png"');
    expect(html).not.toContain('src="https://images.example.com/no-alt.png"');
    expect(html).toContain("Insegura");
    expect(html).toContain("HTTP");
  });
});
