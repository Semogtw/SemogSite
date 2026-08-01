import { Button } from "@semogtw/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { readCookie } from "../../client/cookies";
import { CSRF_COOKIE, logoutOwnerFn } from "../../server/auth";

export function SessionActions() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken === null) {
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const result = await logoutOwnerFn({ data: { csrfToken } });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await navigate({ to: result.redirectTo });
    } catch {
      setMessage("Não foi possível encerrar a sessão.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="devos-session-actions">
      {message ? (
        <p role="alert" className="devos-session-message">
          {message}
        </p>
      ) : null}
      <Button type="button" disabled={pending} onClick={logout}>
        {pending ? "Encerrando…" : "Sair"}
      </Button>
    </div>
  );
}
