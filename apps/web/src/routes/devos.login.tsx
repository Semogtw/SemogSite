import { Button, Surface } from "@semogtw/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { loginOwnerFn } from "../server/auth";

const SearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/devos/login")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Entrar no Semogtw DevOS" },
      { name: "description", content: "Área privada da plataforma Semogtw." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { returnTo } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || password.length === 0) return;
    setPending(true);
    setMessage(null);

    try {
      const data = returnTo === undefined ? { password } : { password, returnTo };
      const result = await loginOwnerFn({ data });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await navigate({ to: result.redirectTo });
    } catch {
      setMessage("Não foi possível autenticar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <Surface className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Semogtw DevOS</p>
        <h1 id="login-title">Acesso privado</h1>
        <p>
          Entre com a credencial do proprietário. Nenhum dado operacional é
          carregado nesta página.
        </p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="owner-password">Senha</label>
          <input
            id="owner-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={message ? "login-error" : undefined}
          />
          {message ? (
            <p id="login-error" role="alert">
              {message}
            </p>
          ) : null}
          <Button
            tone="primary"
            type="submit"
            disabled={pending || password.length === 0}
          >
            {pending ? "Verificando…" : "Entrar"}
          </Button>
        </form>
      </Surface>
    </main>
  );
}
