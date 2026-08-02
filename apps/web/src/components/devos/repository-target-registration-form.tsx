import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import type { RepositoryTargetProjectOption } from "@semogtw/database";
import type { RepositorySyncTargetRole } from "@semogtw/domain";
import { Button, EmptyState } from "@semogtw/ui";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { readCookie } from "../../client/cookies";
import { registerRepositoryTargetFn } from "../../server/devos-repository-target";

const roleOptions: ReadonlyArray<{
  value: RepositorySyncTargetRole;
  label: string;
}> = [
  { value: "product", label: "Produto principal" },
  { value: "core", label: "Núcleo compartilhado" },
  { value: "integration", label: "Integração" },
  { value: "infrastructure", label: "Infraestrutura" },
  { value: "academic", label: "Acadêmico" },
  { value: "experiment", label: "Experimento" },
];

export function RepositoryTargetRegistrationForm({
  projects,
}: {
  projects: readonly RepositoryTargetProjectOption[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [role, setRole] = useState<RepositorySyncTargetRole>("product");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  if (projects.length === 0) {
    return (
      <EmptyState
        title="Nenhum projeto disponível"
        description="Crie ou importe um projeto antes de cadastrar um repositório como alvo de sincronização."
      />
    );
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!confirmed || reason.trim().length === 0) {
      setFeedback({
        success: false,
        message: "Informe o motivo e confirme conscientemente o cadastro.",
      });
      return;
    }

    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setFeedback({
        success: false,
        message: "Não foi possível validar esta sessão.",
      });
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const response = await registerRepositoryTargetFn({
        data: {
          csrfToken,
          projectId,
          fullName,
          defaultBranch,
          role,
          reason,
          confirmed: true,
        },
      });
      setFeedback({ message: response.message, success: response.ok });
      if (!response.ok) return;

      setFullName("");
      setDefaultBranch("main");
      setRole("product");
      setReason("");
      setConfirmed(false);
      await router.invalidate();
    } catch {
      setFeedback({
        success: false,
        message:
          "O alvo não pôde ser cadastrado. Nenhum registro parcial foi confirmado.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="repository-target-form" onSubmit={register}>
      <div className="repository-target-form__grid">
        <label>
          Projeto
          <select
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.slug}
              </option>
            ))}
          </select>
        </label>
        <label>
          Repositório GitHub
          <input
            required
            maxLength={140}
            autoComplete="off"
            placeholder="Semogtw/SemogSite"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label>
          Branch padrão esperada
          <input
            required
            maxLength={255}
            autoComplete="off"
            value={defaultBranch}
            onChange={(event) => setDefaultBranch(event.target.value)}
          />
        </label>
        <label>
          Papel no projeto
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as RepositorySyncTargetRole)
            }
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Motivo do cadastro
        <textarea
          rows={3}
          maxLength={500}
          required
          placeholder="Por que este repositório deve entrar nas observações operacionais do projeto?"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
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
          Confirmo o cadastro privado e entendo que os metadados do GitHub só
          serão verificados na próxima sincronização de leitura.
        </span>
      </label>

      <Button
        type="submit"
        tone="primary"
        disabled={
          pending ||
          !confirmed ||
          projectId.length === 0 ||
          fullName.trim().length === 0 ||
          defaultBranch.trim().length === 0 ||
          reason.trim().length === 0
        }
      >
        {pending ? "Cadastrando…" : "Cadastrar alvo privado"}
      </Button>

      {feedback ? (
        <p
          className={
            feedback.success
              ? "repository-target-form__feedback repository-target-form__feedback--success"
              : "repository-target-form__feedback repository-target-form__feedback--error"
          }
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
