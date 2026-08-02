import { Surface } from "@semogtw/ui";
import { useEffect, useMemo, useState } from "react";
import {
  compareEditorialRevisions,
  type EditorialRevisionDiffInput,
} from "./editorial-revision-diff";

type EditorialRevisionDiffPanelProps = {
  revisions: readonly EditorialRevisionDiffInput[];
};

function revisionLabel(revision: EditorialRevisionDiffInput): string {
  return `r${revision.sequence} · ${revision.title}`;
}

export function EditorialRevisionDiffPanel({
  revisions,
}: EditorialRevisionDiffPanelProps) {
  const newest = revisions[0] ?? null;
  const previous = revisions[1] ?? null;
  const [beforeId, setBeforeId] = useState(previous?.id ?? newest?.id ?? "");
  const [afterId, setAfterId] = useState(newest?.id ?? "");
  const revisionSignature = revisions.map((revision) => revision.id).join(":");

  useEffect(() => {
    setBeforeId(revisions[1]?.id ?? revisions[0]?.id ?? "");
    setAfterId(revisions[0]?.id ?? "");
  }, [revisionSignature]);

  const before = revisions.find((revision) => revision.id === beforeId) ?? null;
  const after = revisions.find((revision) => revision.id === afterId) ?? null;
  const comparison = useMemo(
    () => (before && after ? compareEditorialRevisions(before, after) : null),
    [after, before],
  );

  return (
    <Surface className="editorial-section editorial-revision-diff">
      <div className="surface-heading-row">
        <div>
          <p className="eyebrow">Comparação owner-only</p>
          <h2>Diff de revisões imutáveis</h2>
          <p className="muted-copy">
            A comparação acontece apenas nesta rota autenticada. Trechos longos
            e inalterados são compactados para manter a renderização limitada.
          </p>
        </div>
      </div>

      {revisions.length < 2 ? (
        <p className="muted-copy">
          Crie uma segunda revisão para habilitar a comparação.
        </p>
      ) : (
        <>
          <div className="editorial-diff-selectors">
            <label>
              Revisão base
              <select
                value={beforeId}
                onChange={(event) => setBeforeId(event.target.value)}
              >
                {revisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revisionLabel(revision)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comparar com
              <select
                value={afterId}
                onChange={(event) => setAfterId(event.target.value)}
              >
                {revisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revisionLabel(revision)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {comparison ? (
            <>
              <div className="editorial-diff-summary" aria-label="Resumo do diff">
                <span>+{comparison.body.summary.added} linhas</span>
                <span>−{comparison.body.summary.removed} linhas</span>
                <span>{comparison.body.summary.unchanged} inalteradas</span>
              </div>

              {comparison.fields.length === 0 ? (
                <p className="muted-copy">
                  Título, resumo e tags não mudaram entre estas revisões.
                </p>
              ) : (
                <dl className="editorial-diff-fields">
                  {comparison.fields.map((change) => (
                    <div key={change.field}>
                      <dt>{change.label}</dt>
                      <dd>
                        <span className="editorial-diff-before">
                          <span className="visually-hidden">Antes: </span>
                          {change.before || "—"}
                        </span>
                        <span aria-hidden="true">→</span>
                        <span className="editorial-diff-after">
                          <span className="visually-hidden">Depois: </span>
                          {change.after || "—"}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <ol className="editorial-diff-lines" aria-label="Diferenças no Markdown">
                {comparison.body.lines.map((line, index) => (
                  <li
                    key={`${line.kind}-${line.beforeLine ?? "x"}-${
                      line.afterLine ?? "x"
                    }-${index}`}
                    data-kind={line.kind}
                  >
                    <span className="editorial-diff-line-number" aria-hidden="true">
                      {line.beforeLine ?? ""}
                    </span>
                    <span className="editorial-diff-line-number" aria-hidden="true">
                      {line.afterLine ?? ""}
                    </span>
                    <code>
                      {line.kind === "added"
                        ? "+ "
                        : line.kind === "removed"
                          ? "− "
                          : "  "}
                      {line.text || " "}
                    </code>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </Surface>
  );
}
