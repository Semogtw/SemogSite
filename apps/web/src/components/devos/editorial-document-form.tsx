import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { EditorialDocumentKind } from "@semogtw/domain";
import { Button } from "@semogtw/ui";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { createEditorialDocumentFn } from "../../server/devos-editorial";
import { PROJECT_CASE_STUDY_MARKDOWN_TEMPLATE } from "./editorial-project-case-study-template";
import { slugifyEditorialTitle } from "./editorial-slug";

const kindOptions: ReadonlyArray<{
  value: EditorialDocumentKind;
  label: string;
}> = [
  { value: "project", label: "Projeto" },
  { value: "note", label: "Nota" },
  { value: "experiment", label: "Experimento" },
  { value: "page", label: "Página" },
];

export function EditorialDocumentForm() {
  const navigate = useNavigate();
  const idempotencyKey = useRef<string | null>(null);
  const [kind, setKind] = useState<EditorialDocumentKind>("note");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function invalidateRetryIdentity() {
    idempotencyKey.current = null;
  }

  function applyProjectCaseStudyPreset() {
    if (pending || bodyMarkdown.trim().length > 0) return;
    setKind("project");
    setBodyMarkdown(PROJECT_CASE_STUDY_MARKDOWN_TEMPLATE);
    setFeedback(null);
    invalidateRetryIdentity();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed) {
      setFeedback({
        success: false,
        message: "Confirme que este conteúdo deve permanecer privado.",
      });
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "Não foi possível validar a sessão owner.",
      });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const response = await createEditorialDocumentFn({
        data: {
          csrfToken,
          idempotencyKey: idempotencyKey.current,
          kind,
          slug,
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
      await navigate({
        to: "/devos/content/$documentId",
        params: { documentId: response.document.id },
      });
    } catch {
      setFeedback({
        success: false,
        message:
          "A criação falhou. A mesma identidade será reutilizada na próxima tentativa.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form" onSubmit={submit}>
      <div className="editorial-form__preset" role="group" aria-labelledby="project-preset-title">
        <div>
          <strong id="project-preset-title">Projeto para o portfólio</strong>
          <p>
            Inicia um rascunho privado com a estrutura de case study do Portfolio V1.
            Nada é aprovado ou publicado automaticamente.
          </p>
        </div>
        <Button
          type="button"
          disabled={pending || bodyMarkdown.trim().length > 0}
          onClick={applyProjectCaseStudyPreset}
        >
          Usar estrutura de case study
        </Button>
      </div>

      <div className="editorial-form__grid">
        <label>
          Tipo de documento
          <select
            value={kind}
            disabled={pending}
            onChange={(event) => {
              setKind(event.target.value as EditorialDocumentKind);
              invalidateRetryIdentity();
            }}
          >
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Slug canônico
          <input
            required
            maxLength={120}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            autoCapitalize="none"
            autoComplete="off"
            value={slug}
            disabled={pending}
            placeholder="meu-projeto"
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase());
              setSlugEdited(true);
              invalidateRetryIdentity();
            }}
          />
          <span className="editorial-form__hint">
            {slugEdited
              ? "Slug editado manualmente; mudanças no título não irão substituí-lo."
              : "Sugestão gerada a partir do título até você editar este campo."}
          </span>
        </label>
      </div>

      <label>
        Título
        <input
          required
          maxLength={160}
          value={title}
          disabled={pending}
          onChange={(event) => {
            const nextTitle = event.target.value;
            setTitle(nextTitle);
            if (!slugEdited) setSlug(slugifyEditorialTitle(nextTitle));
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
          placeholder="typescript, react, automação"
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
          rows={18}
          maxLength={100_000}
          value={bodyMarkdown}
          disabled={pending}
          placeholder="# Título\n\nTexto sem HTML bruto."
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
          Confirmo que este é um rascunho privado. Criá-lo não o aprova, não o
          publica e não cria fallback público a partir do DevOS.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          slug.trim().length === 0 ||
          title.trim().length === 0 ||
          excerpt.trim().length === 0 ||
          bodyMarkdown.trim().length === 0
        }
      >
        {pending ? "Criando…" : "Criar rascunho privado"}
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
  );
}
