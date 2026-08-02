import type { RepositoryTargetProjectOption } from "@semogtw/database";
import { Status, Surface } from "@semogtw/ui";
import { RepositoryTargetRegistrationForm } from "./repository-target-registration-form";

export function RepositoryTargetRegistrationPanel({
  projects,
}: {
  projects: readonly RepositoryTargetProjectOption[];
}) {
  return (
    <Surface className="repository-target-panel">
      <div className="surface-heading-row">
        <div>
          <p className="eyebrow">Configuração privada</p>
          <h2>Alvos de sincronização</h2>
          <p className="muted-copy">
            Cadastre a identidade esperada do repositório. O GitHub só será
            consultado numa leitura posterior e nenhum token entra neste
            formulário.
          </p>
        </div>
        <Status tone="neutral">cadastro local</Status>
      </div>
      <RepositoryTargetRegistrationForm projects={projects} />
    </Surface>
  );
}
