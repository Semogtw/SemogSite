import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { createEditorialRevisionFn } from "../../server/devos-editorial";

type RevisionFormProps = {
  documentId: string;
  expectedUpdatedAt: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
};

export function EditorialRevisionForm({
  documentId,
  expectedUpdatedAt,
  title: initialTitle,
  excerpt: initialExcerpt,
  bodyMarkdown: initialBodyMarkdown,
  tags: initialTags,
}: RevisionFormProps) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [bodyMarkdown, setBodyMarkdown] = useState(initialBodyMarkdown);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme conscientemente a criação da revisão imutável.",
      });
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "A sessão owner não pôde ser validada.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await createEditorialRevisionFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          documentId,
          expectedUpdatedAt,
          title,
          excerpt,
          bodyMarkdown,
          tags,
          confirmed: true,
        },
      });
      setFeedback({ success: response.ok, message: response.message });
      if (!response.ok) return;

      idempotencyKey.current = null;
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "A criação falhou. A identidade da tentativa será reutilizada no próximo envio.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="editorial-revision-form">
      <summary>Criar nova revisão imutável</summary>
      <form className="editorial-form" onSubmit={submit}>
        <p className="muted-copy">
          O conteúdo atual é usado apenas como ponto de partida. A revisão
          anterior não será sobrescrita e o estado público não será alterado.
        </p>

        <label>
          Título
          <input
            required
            maxLength={160}
            value={title}
            disabled={pending}
            onChange={(event) => {
              setTitle(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>

        <label>
          Resumo editorial
          <textarea
            required
            rows={3}
            maxLength={320}
            value={excerpt}
            disabled={pending}
            onChange={(event) => {
              setExcerpt(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>

        <label>
          Tags separadas por vírgula
          <input
            maxLength={1_000}
            value={tags}
            disabled={pending}
            onChange={(event) => {
              setTags(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>

        <label>
          Corpo em Markdown seguro
          <textarea
            required
            rows={16}
            maxLength={100_000}
            value={bodyMarkdown}
            disabled={pending}
            onChange={(event) => {
              setBodyMarkdown(event.target.value);
              invalidateRetryIdentity();
            }}
          />
        </label>

        <label className="capture-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={pending}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Confirmo a criação de uma revisão privada e imutável. Esta ação não
            aprova nem publica conteúdo.
          </span>
        </label>

        <Button
          type="submit"
          tone="primary"
          disabled={
            pending ||
            !confirmed ||
            title.trim().length === 0 ||
            excerpt.trim().length === 0 ||
            bodyMarkdown.trim().length === 0
          }
        >
          {pending ? "Salvando…" : "Salvar nova revisão"}
        </Button>

        {feedback ? (
          <p
            className={
              feedback.success
                ? "editorial-form__feedback editorial-form__feedback--success"
                : "editorial-form__feedback editorial-form__feedback--error"
            }
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
