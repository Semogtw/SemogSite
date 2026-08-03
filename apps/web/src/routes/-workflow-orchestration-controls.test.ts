import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("workflow orchestration controls", () => {
  it("exposes owner override only for persisted active reservations", () => {
    const route = source("devos.workflows.tsx");
    const form = source(
      "../components/devos/scope-reservation-override-form.tsx",
    );
    const server = source("../server/devos-scope-reservation-override.ts");

    expect(route).toContain("ScopeReservationOverrideForm");
    expect(route).toContain('reservation.persistedState === "active"');
    expect(route).toContain("expectedVersion={reservation.version}");
    expect(form).toContain("overrideScopeReservationFn");
    expect(form).toContain("Confirmo o encerramento explícito");
    expect(server).toContain("requireMutationOwner");
    expect(server).toContain("service.override");
  });

  it("records observed results only for non-terminal verification obligations", () => {
    const route = source("devos.workflows.tsx");
    const form = source(
      "../components/devos/verification-obligation-result-form.tsx",
    );
    const server = source(
      "../server/devos-verification-obligation-result.ts",
    );

    expect(route).toContain("VerificationObligationResultForm");
    expect(route).toContain("terminalObligationStatuses");
    expect(route).toContain("expectedVersion={obligation.version}");
    expect(form).toContain("recordVerificationResultFn");
    expect(form).toContain("environment_missing");
    expect(server).toContain("requireMutationOwner");
    expect(server).toContain("service.recordResult");
  });

  it("links the workflow dashboard to the owner-only recovery workspace", () => {
    const route = source("devos.workflows.tsx");
    const recoveryRoute = source("devos.workflows_.recovery.tsx");
    const form = source("../components/devos/recovery-snapshot-form.tsx");
    const server = source("../server/devos-recovery-snapshot.ts");

    expect(route).toContain('to="/devos/workflows/recovery"');
    expect(route).toContain("Gerar snapshot de recuperação");
    expect(recoveryRoute).toContain("requireOwner");
    expect(recoveryRoute).toContain("RecoverySnapshotForm");
    expect(form).toContain("createRecoverySnapshotFn");
    expect(server).toContain("SqliteRecoverySnapshotSource");
    expect(server).toContain("RecoverySnapshotService");
  });

  it("lists immutable recovery snapshots with copy fallback", () => {
    const recoveryRoute = source("devos.workflows_.recovery.tsx");
    const history = source("../components/devos/recovery-snapshot-history.tsx");
    const server = source("../server/devos-workflows.ts");

    expect(server).toContain("SqliteRecoverySnapshotReadModel");
    expect(server).toContain("listRecent(20)");
    expect(recoveryRoute).toContain("RecoverySnapshotHistory");
    expect(recoveryRoute).toContain("dashboard.recoverySnapshots");
    expect(history).toContain("navigator.clipboard.writeText");
    expect(history).toContain("Selecione manualmente o conteúdo");
    expect(history).toContain("snapshot.canonicalHash");
  });

  it("shows persisted safe-work recommendations without inventing runtime capabilities", () => {
    const route = source("devos.workflows.tsx");
    const server = source("../server/devos-workflows.ts");

    expect(server).toContain("SqliteSafeWorkSource");
    expect(server).toContain("availableCapabilities: []");
    expect(server).toContain("defaultEstimatedMinutes: 60");
    expect(route).toContain("SafeWorkCapabilityEvaluator");
    expect(route).toContain("initialEvaluation={dashboard.safeWork}");
  });

  it("re-evaluates safe work only from explicit owner-provided capabilities", () => {
    const component = source(
      "../components/devos/safe-work-capability-evaluator.tsx",
    );
    const server = source("../server/devos-safe-work.ts");

    expect(component).toContain("evaluateSafeWorkFn");
    expect(component).toContain("Capacidades do runtime atual");
    expect(component).toContain("Nenhuma capacidade é presumida");
    expect(component).toContain("splitCapabilities");
    expect(server).toContain("resolveCurrentOwner");
    expect(server).toContain("SqliteSafeWorkSource");
    expect(server).toContain("availableCapabilities: data.capabilities");
    expect(server).toContain("defaultEstimatedMinutes: data.defaultEstimatedMinutes");
  });
});
