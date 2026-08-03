import {
  Fragment,
  type ReactNode,
  createElement,
} from "react";

type PublicMarkdownProps = {
  markdown: string;
};

type InlineMatch = {
  index: number;
  length: number;
  render: (key: string) => ReactNode;
};

function reviewedHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (
    href.length === 0 ||
    /[\u0000-\u001f\u007f\s\\]/u.test(href) ||
    href.startsWith("//")
  ) {
    return null;
  }

  if (/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*$/u.test(href)) {
    return href;
  }
  if (/^#[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(href)) {
    return href;
  }

  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function nextInlineMatch(value: string): InlineMatch | null {
  const matches: InlineMatch[] = [];

  const code = /`([^`\n]+)`/u.exec(value);
  if (code?.index !== undefined) {
    matches.push({
      index: code.index,
      length: code[0].length,
      render: (key) => <code key={key}>{code[1]}</code>,
    });
  }

  const strong = /\*\*([^*\n]+)\*\*/u.exec(value);
  if (strong?.index !== undefined) {
    matches.push({
      index: strong.index,
      length: strong[0].length,
      render: (key) => <strong key={key}>{strong[1]}</strong>,
    });
  }

  const emphasis = /\*([^*\n]+)\*/u.exec(value);
  if (emphasis?.index !== undefined) {
    matches.push({
      index: emphasis.index,
      length: emphasis[0].length,
      render: (key) => <em key={key}>{emphasis[1]}</em>,
    });
  }

  const link = /\[([^\]\n]+)\]\(([^)\n]+)\)/u.exec(value);
  if (link?.index !== undefined) {
    const href = reviewedHref(link[2] ?? "");
    matches.push({
      index: link.index,
      length: link[0].length,
      render: (key) =>
        href === null ? (
          <Fragment key={key}>{link[1]}</Fragment>
        ) : href.startsWith("https://") ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {link[1]}
          </a>
        ) : (
          <a key={key} href={href}>
            {link[1]}
          </a>
        ),
    });
  }

  return (
    matches.sort((left, right) => left.index - right.index || right.length - left.length)[0] ??
    null
  );
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = value;
  let token = 0;

  while (remaining.length > 0) {
    const match = nextInlineMatch(remaining);
    if (match === null) {
      nodes.push(remaining);
      break;
    }
    if (match.index > 0) nodes.push(remaining.slice(0, match.index));
    nodes.push(match.render(`${keyPrefix}-${token}`));
    token += 1;
    remaining = remaining.slice(match.index + match.length);
  }

  return nodes;
}

function startsBlock(line: string): boolean {
  return (
    line.trim().length === 0 ||
    /^```/u.test(line) ||
    /^#{1,3}\s+/u.test(line) ||
    /^>\s?/u.test(line) ||
    /^\s*[-*]\s+/u.test(line) ||
    /^\s*\d+\.\s+/u.test(line)
  );
}

export function PublicMarkdown({ markdown }: PublicMarkdownProps) {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = /^```([A-Za-z0-9_-]{0,24})\s*$/u.exec(line);
    if (fence !== null) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1];
      blocks.push(
        <pre key={`code-${index}`} className="public-markdown__code">
          <code {...(language ? { "data-language": language } : {})}>
            {code.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "#").length as 1 | 2 | 3;
      blocks.push(
        createElement(
          `h${level}`,
          { key: `heading-${index}` },
          renderInline((heading[2] ?? "").trim(), `heading-${index}`),
        ),
      );
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInline(quote.join(" "), `quote-${index}`)}
        </blockquote>,
      );
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/u.exec(line);
    if (unordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*[-*]\s+(.+)$/u.exec(lines[index] ?? "");
        if (item === null) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-${index}-${itemIndex}`}>
              {renderInline(item, `ul-${index}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const ordered = /^\s*\d+\.\s+(.+)$/u.exec(line);
    if (ordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*\d+\.\s+(.+)$/u.exec(lines[index] ?? "");
        if (item === null) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-${index}-${itemIndex}`}>
              {renderInline(item, `ol-${index}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !startsBlock(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {renderInline(paragraph.join(" "), `paragraph-${index}`)}
      </p>,
    );
  }

  return <div className="public-markdown">{blocks}</div>;
}
