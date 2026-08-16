import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import { Button } from "@semogtw/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { readCookie } from "../../client/cookies";
import { logoutPrivateOwner } from "../../lib/private-auth-client";

export function SessionActions() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken === null) {
      setMessage("Não foi possível validar esta sessão.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      await logoutPrivateOwner(csrfToken);
      await navigate({ to: "/devos/login" });
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
