import type { SafeWorkSourceResult } from "@semogtw/database";
import { Button, EmptyState, Status } from "@semogtw/ui";
import { useState, type FormEvent } from "react";
import { evaluateSafeWorkFn } from "../../server/devos-safe-work";

export function splitCapabilities(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/u)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function SafeWorkCapabilityEvaluator({
  initialEvaluation,
}: {
  initialEvaluation: SafeWorkSourceResult;
}) {
  const [capabilities, setCapabilities] = useState("");
  const [defaultEstimatedMinutes, setDefaultEstimatedMinutes] = useState(60);
  const [evaluation, setEvaluation] =
    useState<SafeWorkSourceResult>(initialEvaluation);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await evaluateSafeWorkFn({
        data: {
          capabilities: splitCapabilities(capabilities),
          defaultEstimatedMinutes,
        },
      });
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      setEvaluation(response.evaluation);
      setMessage(
        splitCapabilities(capabilities).length === 0
          ? "Avaliação conservadora atualizada sem presumir capacidades."
          : "Avaliação atualizada apenas com as capacidades declaradas nesta sessão.",
      );
    } catch {
      setMessage("A avaliação falhou sem alterar o estado persistido.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="operations-stack">
      <form className="run-command-form" onSubmit={submit}>
        <div className="run-command-form__grid">
          <label>
            Capacidades do runtime atual
            <input
              value={capabilities}
              disabled={pending}
              maxLength={1_000}
              placeholder="node-22, pnpm-10, github-write, android-sdk"
              onChange={(event) => setCapabilities(event.target.value)}
            />
          </label>
          <label>
            Duração padrão da unidade
            <select
              value={defaultEstimatedMinutes}
              disabled={pending}
              onChange={(event) =>
                setDefaultEstimatedMinutes(Number(event.target.value))
              }
            >
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora e 30 minutos</option>
              <option value={120}>2 horas</option>
              <option value={240}>4 horas</option>
            </select>
          </label>
        </div>
        <p className="muted-copy">
          Nenhuma capacidade é presumida ou persistida. Este filtro vale somente
          para a avaliação exibida nesta sessão.
        </p>
        <Button type="submit" tone="primary" disabled={pending}>
          {pending ? "Avaliando…" : "Reavaliar trabalho seguro"}
        </Button>
        {message === null ? null : <p role="status">{message}</p>}
      </form>

      {evaluation.errors.length > 0 ? (
        <p className="run-command-form__feedback run-command-form__feedback--error">
          Avaliação indisponível: {evaluation.errors.join(", ")}
        </p>
      ) : evaluation.recommendations.length === 0 ? (
        <EmptyState
          title="Nenhuma etapa segura agora"
          description="As exclusões abaixo explicam repositórios ambíguos, decisões do proprietário, reservas, gates ou capacidades ausentes."
        />
      ) : (
        <div className="devos-record-list">
          {evaluation.recommendations.map((recommendation) => (
            <article
              className="devos-record devos-record--stacked"
              key={recommendation.candidateId}
            >
              <div className="devos-record__main">
                <div>
                  <h3>{recommendation.title}</h3>
                  <p>
                    Etapa <code>{recommendation.candidateId}</code>
                  </p>
                </div>
                <Status tone="success">score {recommendation.score}</Status>
              </div>
              <p className="muted-copy">
                Motivos: {recommendation.reasons.join(", ")}
              </p>
              <p className="muted-copy">
                Fonte observada em {recommendation.sourceObservedAt}
              </p>
            </article>
          ))}
        </div>
      )}

      {evaluation.exclusions.length === 0 ? null : (
        <div className="devos-record-list">
          <h3>Exclusões do avaliador</h3>
          {evaluation.exclusions.map((exclusion) => (
            <article className="devos-record" key={exclusion.candidateId}>
              <div>
                <strong>{exclusion.candidateId}</strong>
                <p className="muted-copy">
                  {exclusion.codes.join(", ")}
                  {exclusion.details.length === 0
                    ? ""
                    : ` · ${exclusion.details.join(", ")}`}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {evaluation.sourceExclusions.length === 0 ? null : (
        <div className="devos-record-list">
          <h3>Exclusões da fonte persistida</h3>
          {evaluation.sourceExclusions.map((exclusion) => (
            <article className="devos-record" key={exclusion.stageId}>
              <div>
                <strong>{exclusion.stageId}</strong>
                <p className="muted-copy">
                  {exclusion.code}
                  {exclusion.details.length === 0
                    ? ""
                    : ` · ${exclusion.details.join(", ")}`}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
