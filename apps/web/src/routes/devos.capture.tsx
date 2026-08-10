import { Button, Status, Surface } from "@semogtw/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AttentionCaptureForm } from "../components/devos/attention-capture-form";
import { DevOSShell } from "../components/devos/devos-shell";
import { SessionHandoffForm } from "../components/devos/session-handoff-form";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/capture")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [
      { title: "Capturar — Semogtw DevOS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CapturePage,
});

type CaptureMode = "attention" | "handoff";

function CapturePage() {
  const [mode, setMode] = useState<CaptureMode>("attention");

  return (
    <DevOSShell activePath="/devos/more">
      <header className="devos-page-header">
        <div>
          <p className="eyebrow">Entrada rápida</p>
          <h1>Capturar</h1>
        </div>
        <Status tone="info">Escrita auditada</Status>
      </header>

      <div className="capture-mode-switch" aria-label="Tipo de registro">
        <Button
          tone={mode === "attention" ? "primary" : "neutral"}
          aria-pressed={mode === "attention"}
          onClick={() => setMode("attention")}
        >
          Atenção
        </Button>
        <Button
          tone={mode === "handoff" ? "primary" : "neutral"}
          aria-pressed={mode === "handoff"}
          onClick={() => setMode("handoff")}
        >
          Handoff de sessão
        </Button>
      </div>

      <Surface className="capture-surface">
        <div className="capture-intro">
          <h2>
            {mode === "attention" ? "Nova atenção" : "Continuidade da sessão"}
          </h2>
          <p>
            {mode === "attention"
              ? "Registre um risco, bloqueio, decisão, dependência ou teste crítico. A criação exige confirmação e gera auditoria na mesma transação."
              : "Registre trabalho concluído, testes observados, bloqueios e a próxima ação exata. O ator e o horário são definidos pelo servidor autenticado."}
          </p>
        </div>

        {mode === "attention" ? (
          <AttentionCaptureForm />
        ) : (
          <SessionHandoffForm />
        )}
      </Surface>
    </DevOSShell>
  );
}
