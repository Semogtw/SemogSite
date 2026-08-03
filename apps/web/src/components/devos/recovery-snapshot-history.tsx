import type { RecoverySnapshotView } from "@semogtw/database";
import { Button, EmptyState, Status } from "@semogtw/ui";
import { useState } from "react";

export function RecoverySnapshotHistory({
  snapshots,
}: {
  snapshots: readonly RecoverySnapshotView[];
}) {
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});

  async function copySnapshot(snapshot: RecoverySnapshotView) {
    try {
      await navigator.clipboard.writeText(snapshot.markdown);
      setCopyStatus((current) => ({
        ...current,
        [snapshot.id]: "Snapshot copiado.",
      }));
    } catch {
      setCopyStatus((current) => ({
        ...current,
        [snapshot.id]:
          "O navegador negou o clipboard. Selecione manualmente o conteúdo abaixo.",
      }));
    }
  }

  if (snapshots.length === 0) {
    return (
      <EmptyState
        title="Nenhum snapshot preservado"
        description="O primeiro handoff imutável aparecerá aqui após uma geração confirmada."
      />
    );
  }

  return (
    <div className="devos-record-list">
      {snapshots.map((snapshot) => (
        <article
          className="devos-record devos-record--stacked"
          key={snapshot.id}
        >
          <div className="devos-record__main">
            <div>
              <h3>{snapshot.repositoryFullName}</h3>
              <p>
                <code>{snapshot.branch}</code> ·{" "}
                <code>{snapshot.observedCommitSha.slice(0, 12)}</code>
              </p>
            </div>
            <Status
              tone={
                snapshot.confidence === "high"
                  ? "success"
                  : snapshot.confidence === "medium"
                    ? "warning"
                    : "danger"
              }
            >
              confiança {snapshot.confidence}
            </Status>
          </div>
          <p className="muted-copy">
            Gerado em {snapshot.generatedAt} · fonte observada em{" "}
            {snapshot.sourceObservedAt}
          </p>
          <p className="muted-copy">
            Projeto: {snapshot.projectName} · template {snapshot.templateId}@
            {snapshot.templateVersion}
          </p>
          <p className="muted-copy">
            SHA-256: <code>{snapshot.canonicalHash}</code>
          </p>
          <details>
            <summary>Visualizar handoff preservado</summary>
            <textarea
              aria-label={`Snapshot de recuperação ${snapshot.id}`}
              readOnly
              rows={12}
              value={snapshot.markdown}
            />
          </details>
          <Button
            type="button"
            tone="neutral"
            onClick={() => copySnapshot(snapshot)}
          >
            Copiar handoff preservado
          </Button>
          {copyStatus[snapshot.id] === undefined ? null : (
            <p role="status">{copyStatus[snapshot.id]}</p>
          )}
        </article>
      ))}
    </div>
  );
}
