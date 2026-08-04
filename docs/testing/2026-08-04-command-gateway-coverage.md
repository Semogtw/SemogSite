# Command Gateway — cobertura de editabilidade

## Convenções

- `legacy_direct`: continua no handler browser atual até uma migração dedicada.
- `pilot`: primeira escrita executada pelo Gateway.
- `registered_blocked`: existe no registry, mas o executor deve negar até a condição indicada existir.
- `low`: alteração privada e reversível com baixo impacto.
- `medium`: exige confirmação explícita no cliente proprietário.
- `high`: exige approval no DevOS; não pode ser reduzido por policy de cliente.
- recursos usam IDs internos estáveis; nomes, slugs e branches não substituem identidade canônica.
- `packages/application/src/editability-catalog.json#mutationSurfaces` classifica cada arquivo privado que registra `createServerFn({ method: "POST" })` como `gateway`, `legacy_registered` ou exclusão não canônica com motivo fechado.

## Matriz

| Command ID | UI/handler atual | Serviço ou histórico atual | Capability | Recurso | Risco / confirmação | Conflito e idempotência | Undo/compensação | Estado |
|---|---|---|---|---|---|---|---|---|
| `attention.create` | `/devos/capture` → `captureAttentionFn` | `AttentionCaptureService`; attention + audit | `attention.write` | `attention:new` | low / allow owner | idempotency UUID; conflito semântico | resolve/cancelar por nova transição; histórico preservado | legacy_direct |
| `attention.transition` | attention lifecycle controls → `transitionAttentionFn` | `AttentionLifecycleService`; lifecycle audit | `attention.write` | `attention_item:{attentionId}` | medium / confirm_in_client | `expectedUpdatedAt` + receipt hash | nova transição explícita | **pilot** |
| `evidence.create` | project evidence form → `attachManualEvidenceFn` | `EvidenceService`; evidence + audit | `evidence.write` | `project:{projectId}` ou `stage:{stageId}` | medium / confirmação explícita | vínculos canônicos + auditoria transacional | nova evidência corretiva; histórico preservado | legacy_direct |
| `growth.goals.quick_create` | `/devos/growth` → `quickCreateLearningGoalFn` | `QuickLearningGoalService`; goal/checkpoint events + audit | `growth.goals.write` | `growth-goal:new` | low / allow owner | idempotency UUID; slug/semantics | archive/cancel via comando futuro | legacy_direct |
| `growth.checkpoints.rebalance_weights` | goal detail → `applyGrowthWeightRebalanceFn` | `CheckpointWeightRebalanceService`; checkpoint events + aggregate audit | `growth.checkpoints.write` | `growth-goal:{goalId}` | medium / confirmação quando custom muda | goal/checkpoint versions + semantic receipt | nova redistribuição server-derived | legacy_direct |
| `runs.register` | runs UI → `registerCooperativeRunFn` | `CooperativeRunRegistrationService`; run event/audit | `runs.write` | `run:new` | low / allow owner | registration key + branch identity | cancel/complete por transição | legacy_direct |
| `runs.transition` | run controls → `transitionCooperativeRunFn` | `CooperativeRunTransitionService`; append-only run event | `runs.write` | `run:{runId}` | medium / confirm_in_client | expected sequence/version + idempotency | transição compensatória quando válida | legacy_direct |
| `runs.checkpoints.record` | run checkpoint form → `recordCooperativeRunCheckpointFn` | `CooperativeRunCheckpointService`; checkpoint + event | `runs.checkpoints.write` | `run:{runId}` | low / allow owner | snapshot sequence + idempotency | novo checkpoint corretivo; sem apagar histórico | legacy_direct |
| `runs.commands.enqueue` | run command controls → `enqueueCooperativeRunCommandFn` | `CooperativeRunCommandService`; command ledger | `runs.commands.write` | `run:{runId}` | medium / confirm_in_client | expected sequence + idempotency | comando compensatório; fila preservada | legacy_direct |
| `sessions.handoff.record` | handoff form → `recordSessionHandoffFn` | `CooperativeRunHandoffService`; checkpoint/event | `runs.handoffs.write` | `run:{runId}` | low / allow owner | run snapshot + idempotency | novo handoff supersessor | legacy_direct |
| `recovery.snapshots.create` | recovery action → `createRecoverySnapshotFn` | `RecoverySnapshotService`; immutable snapshot | `recovery.snapshots.write` | `repository:{repositoryId}` | low / allow owner | exact branch/commit + idempotency | novo snapshot; anterior preservado | legacy_direct |
| `repositories.targets.register` | project repository form → `registerRepositoryTargetFn` | `RepositoryTargetRegistrationService`; target + audit | `repositories.targets.write` | `project:{projectId}` | medium / confirm_in_client | duplicate full name + audit correlation | lifecycle pause; remoção não implícita | legacy_direct |
| `repositories.targets.lifecycle_change` | target controls → `changeRepositoryTargetLifecycleFn` | `RepositoryTargetLifecycleService`; target + audit | `repositories.targets.write` | `repository:{repositoryId}` | medium / confirm_in_client | expected sync state + updatedAt | inverter estado com novo comando | legacy_direct |
| `repositories.branches.accept_recommendation` | branch recommendation UI → `acceptBranchRecommendationFn` | `BranchRecommendationAcceptanceService`; repository + audit | `repositories.branches.write` | `repository:{repositoryId}` | medium / confirm_in_client | recommendation ID + expected active branch | aceitar nova recomendação; não faz checkout | legacy_direct |
| `github.repositories.sync_observations` | sync control → `syncGitHubRepositoryFn` | `GitHubObservationsSyncService`; sync run/observations | `integrations.github.sync` | `repository:{repositoryId}` | medium / confirm_in_client | request identity + observed rate-limit state | nova sincronização; observações históricas | legacy_direct |
| `scope_reservations.acquire` | workflow controls → `acquireScopeReservationFn` | `ScopeReservationService`; reservation/event/audit | `workflows.scopes.write` | `repository:{repositoryId}:branch:{branch}` | medium / confirm_in_client | overlap policy + idempotency | release | legacy_direct |
| `scope_reservations.release` | workflow controls → `releaseScopeReservationFn` | `ScopeReservationService`; release event/audit | `workflows.scopes.write` | `scope-reservation:{reservationId}` | medium / confirm_in_client | expected version/run + idempotency | adquirir nova reserva | legacy_direct |
| `scope_reservations.override` | owner override control → `overrideScopeReservationFn` | `ScopeReservationService`; forced-close event/audit | `workflows.scopes.override` | `scope-reservation:{reservationId}` | **high / approve_in_devos** | expected version + idempotency | nova reserva; override permanece auditado | legacy_direct, future approval migration |
| `verification_obligations.create` | workflow controls → `createVerificationObligationFn` | `VerificationObligationService`; obligation/event/audit | `verification.obligations.write` | `repository:{repositoryId}:commit:{sha}` | medium / confirm_in_client | commit/gate identity + idempotency | superseding obligation | legacy_direct |
| `verification_obligations.record_result` | gate result form → `recordVerificationResultFn` | `VerificationObligationService`; result event/audit | `verification.results.write` | `verification-obligation:{obligationId}` | medium / confirm_in_client | expected version + idempotency | novo resultado corretivo com evidência | legacy_direct |
| `editorial.documents.create` | content editor → `createEditorialDocumentFn` | `createEditorialDocumentCommand`; document/revision/event | `editorial.documents.write` | `editorial-document:new` | medium / confirm_in_client | slug + idempotency + content hash | arquivar/novo documento; sem delete silencioso | legacy_direct |
| `editorial.revisions.create` | editor → `createEditorialRevisionFn` | `createEditorialRevisionCommand`; revision/event | `editorial.revisions.write` | `editorial-document:{documentId}` | medium / confirm_in_client | expectedUpdatedAt + content hash + idempotency | nova revisão | legacy_direct |
| `editorial.review.submit` | review control → `submitEditorialForReviewFn` | `submitEditorialForReviewCommand`; workflow event | `editorial.review.submit` | `editorial-document:{documentId}` | medium / confirm_in_client | expectedUpdatedAt + idempotency | reopen draft | legacy_direct |
| `editorial.review.approve` | approval checklist → `approveEditorialRevisionFn` | `approveEditorialRevisionCommand`; approval/event | `editorial.review.approve` | `editorial-document:{documentId}:revision:{revisionId}` | **high / approve_in_devos** | expectedUpdatedAt + revision/hash + idempotency | reopen draft; approval permanece histórico | legacy_direct, future approval migration |
| `editorial.drafts.reopen` | content controls → `reopenEditorialDraftFn` | `reopenEditorialDraftCommand`; workflow event | `editorial.documents.write` | `editorial-document:{documentId}` | medium / confirm_in_client | expectedUpdatedAt + idempotency | resubmit/reapprove | legacy_direct |
| `editorial.publications.publish` | publish control → `publishEditorialRevisionFn` | `publishEditorialRevisionCommand`; publication event | `editorial.publish` | `editorial-document:{documentId}:revision:{revisionId}` | **high / approve_in_devos** | expectedUpdatedAt + approved revision/hash + idempotency | withdraw ou rollback explícito | legacy_direct, future approval migration |
| `editorial.publications.withdraw` | publication control → `withdrawEditorialPublicationFn` | `withdrawEditorialPublicationCommand`; publication event | `editorial.publish` | `editorial-document:{documentId}` | **high / approve_in_devos** | expectedUpdatedAt + idempotency | publicar revisão aprovada novamente | legacy_direct, future approval migration |
| `editorial.publications.rollback` | publication history → `rollbackEditorialPublicationFn` | `rollbackEditorialPublicationCommand`; publication event | `editorial.publish` | `editorial-document:{documentId}:revision:{revisionId}` | **high / approve_in_devos** | expectedUpdatedAt + target revision/hash + idempotency | novo rollback/publish | legacy_direct, future approval migration |
| `editorial.redirects.create` | redirect manager → `createEditorialRedirectFn` | `createEditorialRedirectCommand`; redirect event | `editorial.redirects.write` | `editorial-redirect:{kind}:{sourceSlug}` | medium / confirm_in_client | target identity + source slug + idempotency | revoke | legacy_direct |
| `editorial.redirects.revoke` | redirect manager → `revokeEditorialRedirectFn` | `revokeEditorialRedirectCommand`; redirect event | `editorial.redirects.write` | `editorial-redirect:{kind}:{sourceSlug}` | medium / confirm_in_client | active event + target identity + idempotency | create novo alias | legacy_direct |
| `roadmap.stages.complete` | project detail → `completeStageFn` | `StageCompletionService`; stage/project/audit | `roadmap.write` | `stage:{stageId}` | **high / approve_in_devos** | exact snapshot/evidence + receipt quando approvals existirem | compensação explícita; sem restauração silenciosa | **registered_blocked** |

## Operações fora do registry de editabilidade

| Superfície | Motivo |
|---|---|
| `evaluateSafeWorkFn` | avaliação bounded sem commit canônico; catálogo marca `bounded_evaluation` |
| login/logout/session | infraestrutura de autenticação, não capability de entidade DevOS; catálogo marca `authentication_infrastructure` |
| previews de template/rebalance | preparação de leitura, não execução |
| consultas GET privadas | cobertas por autorização de leitura, fora do catálogo de writes desta fase |

## Regras derivadas da matriz

1. Nenhum cliente pode reduzir o risk floor do registry.
2. `high` nunca executa por simples `confirmed: true` no envelope do Gateway.
3. `registered_blocked` retorna policy denial/approval requirement antes de chamar runner.
4. O receipt precisa distinguir replay exato de reutilização conflitante da chave.
5. Undo significa nova ação explícita ou compensação; não delete de histórico.
6. IDs, versões e hashes vêm do servidor ou de snapshots observados, nunca de labels de UI.
7. Todo arquivo privado que registra POST deve estar no catálogo executável; uma nova mutação não classificada falha `check:editability-coverage`.
8. `legacy_registered` documenta dívida de migração, não paridade UI/MCP nem conclusão.
