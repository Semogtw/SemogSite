export type EditorialRevisionDiffInput = {
  id: string;
  sequence: number;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
};

export type EditorialRevisionFieldChange = {
  field: "title" | "excerpt" | "tags";
  label: "Título" | "Resumo" | "Tags";
  before: string;
  after: string;
};

export type EditorialRevisionDiffLine = {
  kind: "equal" | "added" | "removed" | "omitted";
  beforeLine: number | null;
  afterLine: number | null;
  text: string;
};

export type EditorialRevisionComparison = {
  fields: readonly EditorialRevisionFieldChange[];
  body: {
    lines: readonly EditorialRevisionDiffLine[];
    summary: {
      added: number;
      removed: number;
      unchanged: number;
    };
  };
};

const visibleContextLines = 4;
const visibleChangedLines = 30;

function splitLines(value: string): string[] {
  return value.replace(/\r\n?/gu, "\n").split("\n");
}

function appendEqualRun(
  target: EditorialRevisionDiffLine[],
  lines: readonly string[],
  beforeStart: number,
  afterStart: number,
) {
  const count = lines.length;
  if (count <= visibleContextLines * 2 + 1) {
    lines.forEach((text, index) => {
      target.push({
        kind: "equal",
        beforeLine: beforeStart + index + 1,
        afterLine: afterStart + index + 1,
        text,
      });
    });
    return;
  }

  lines.slice(0, visibleContextLines).forEach((text, index) => {
    target.push({
      kind: "equal",
      beforeLine: beforeStart + index + 1,
      afterLine: afterStart + index + 1,
      text,
    });
  });
  const omitted = count - visibleContextLines * 2;
  target.push({
    kind: "omitted",
    beforeLine: null,
    afterLine: null,
    text: `… ${omitted} linhas inalteradas omitidas …`,
  });
  lines.slice(-visibleContextLines).forEach((text, index) => {
    const offset = count - visibleContextLines + index;
    target.push({
      kind: "equal",
      beforeLine: beforeStart + offset + 1,
      afterLine: afterStart + offset + 1,
      text,
    });
  });
}

function appendChangedRun(
  target: EditorialRevisionDiffLine[],
  kind: "added" | "removed",
  lines: readonly string[],
  start: number,
) {
  const lineKey = kind === "removed" ? "beforeLine" : "afterLine";
  const push = (text: string, index: number) => {
    target.push({
      kind,
      beforeLine: lineKey === "beforeLine" ? start + index + 1 : null,
      afterLine: lineKey === "afterLine" ? start + index + 1 : null,
      text,
    });
  };

  if (lines.length <= visibleChangedLines * 2 + 1) {
    lines.forEach(push);
    return;
  }

  lines.slice(0, visibleChangedLines).forEach(push);
  target.push({
    kind: "omitted",
    beforeLine: null,
    afterLine: null,
    text: `… ${lines.length - visibleChangedLines * 2} linhas ${
      kind === "added" ? "adicionadas" : "removidas"
    } omitidas …`,
  });
  lines.slice(-visibleChangedLines).forEach((text, index) => {
    push(text, lines.length - visibleChangedLines + index);
  });
}

function fieldChanges(
  before: EditorialRevisionDiffInput,
  after: EditorialRevisionDiffInput,
): EditorialRevisionFieldChange[] {
  const changes: EditorialRevisionFieldChange[] = [];
  if (before.title !== after.title) {
    changes.push({
      field: "title",
      label: "Título",
      before: before.title,
      after: after.title,
    });
  }
  if (before.excerpt !== after.excerpt) {
    changes.push({
      field: "excerpt",
      label: "Resumo",
      before: before.excerpt,
      after: after.excerpt,
    });
  }
  const beforeTags = before.tags.join(", ");
  const afterTags = after.tags.join(", ");
  if (beforeTags !== afterTags) {
    changes.push({
      field: "tags",
      label: "Tags",
      before: beforeTags,
      after: afterTags,
    });
  }
  return changes;
}

export function compareEditorialRevisions(
  before: EditorialRevisionDiffInput,
  after: EditorialRevisionDiffInput,
): EditorialRevisionComparison {
  const beforeLines = splitLines(before.bodyMarkdown);
  const afterLines = splitLines(after.bodyMarkdown);

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - suffix - 1] ===
      afterLines[afterLines.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const beforeChanged = beforeLines.slice(
    prefix,
    beforeLines.length - suffix,
  );
  const afterChanged = afterLines.slice(prefix, afterLines.length - suffix);
  const lines: EditorialRevisionDiffLine[] = [];

  appendEqualRun(lines, beforeLines.slice(0, prefix), 0, 0);
  appendChangedRun(lines, "removed", beforeChanged, prefix);
  appendChangedRun(lines, "added", afterChanged, prefix);
  appendEqualRun(
    lines,
    beforeLines.slice(beforeLines.length - suffix),
    beforeLines.length - suffix,
    afterLines.length - suffix,
  );

  return {
    fields: fieldChanges(before, after),
    body: {
      lines,
      summary: {
        added: afterChanged.length,
        removed: beforeChanged.length,
        unchanged: prefix + suffix,
      },
    },
  };
}
