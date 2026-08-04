# Command Gateway — baseline de implementação

## Escopo

Esta baseline foi levantada em `develop/command-gateway-foundation-implementation`, empilhada sobre a PR #24. Ela documenta as superfícies de mutação já presentes antes da introdução do Command Gateway.

A classificação considera uma operação como mutação quando ela altera estado canônico privado, histórico append-only, projeções de integração ou estado editorial. POSTs usados apenas para avaliação/leitura e o ciclo de autenticação não entram no catálogo de editabilidade de domínio.

## Estado arquitetural observado

As mutações atuais compartilham bons invariantes locais, mas não uma fronteira de aplicação única:

- o browser chama `createServerFn({ method: "POST" })` diretamente;
- cada handler repete autorização CSRF, abertura do banco, geração de IDs, adaptação de erros e criação do serviço;
- vários serviços já compõem domínio, auditoria e concorrência otimista corretamente;
- idempotência existe em parte das operações, mas o envelope e o receipt não são uniformes;
- risco e confirmação são expressos implicitamente por schemas, `confirmed: true` e fluxos específicos;
- não existe registry central de `commandId`, capability, resource, risk floor, conflito, undo e executor;
- não existe descoberta canônica de ações por entidade;
- não existe uma superfície neutra compartilhada por browser e futuros clientes MCP;
- nenhuma mutação MCP está ativa.

## Famílias de mutação observadas

### Attention e captura

1. `attention.create` — criação manual de atenção.
2. `attention.transition` — acknowledge, resolve, snooze e reopen; piloto medium-risk do Gateway.

### Growth

3. `growth.goals.quick_create` — criação manual ou por template determinístico.
4. `growth.checkpoints.rebalance_weights` — preview e aplicação server-derived; não aceita pesos do browser.

### Runs, handoff e recuperação

5. `runs.register` — registra relato cooperativo; não inicia processo.
6. `runs.transition` — heartbeat, block, resume, complete, cancel e fail.
7. `runs.checkpoints.record` — registra checkpoint observado.
8. `runs.commands.enqueue` — enfileira intenção de continue/cancel/pause/resume/request_checkpoint/request_handoff; não executa processo externo.
9. `sessions.handoff.record` — registra handoff auditado.
10. `recovery.snapshots.create` — gera snapshot canônico para retomada.

### Repositórios e observações GitHub

11. `repositories.targets.register` — cadastra alvo privado.
12. `repositories.targets.lifecycle_change` — pausa ou reativa sincronização.
13. `repositories.branches.accept_recommendation` — aceita branch observada como ativa no DevOS; não faz checkout ou push.
14. `github.repositories.sync_observations` — busca e persiste observações externas; não altera o repositório remoto.

### Coordenação de workflow

15. `scope_reservations.acquire` — reserva escopo cooperativo.
16. `scope_reservations.release` — libera reserva pelo run informado.
17. `scope_reservations.override` — encerramento forçado pelo proprietário; high-risk.
18. `verification_obligations.create` — registra gate pendente para commit exato.
19. `verification_obligations.record_result` — registra passed/failed/blocked com evidência e classificação.

### Editorial

20. `editorial.documents.create` — cria documento e primeira revisão privados.
21. `editorial.revisions.create` — cria nova revisão privada.
22. `editorial.review.submit` — envia working revision para revisão.
23. `editorial.review.approve` — aprova revisão após checklist sensível; high-risk.
24. `editorial.drafts.reopen` — reabre fluxo para edição.
25. `editorial.publications.publish` — publica revisão aprovada; high-risk.
26. `editorial.publications.withdraw` — retira projeção pública; high-risk.
27. `editorial.publications.rollback` — volta publicação a revisão anterior; high-risk.
28. `editorial.redirects.create` / `editorial.redirects.revoke` — gerencia aliases públicos auditados.

### Roadmap

29. `roadmap.stages.complete` — conclui etapa e pode alterar o estágio atual; high-risk e reservado para approval DevOS. Não será executado pelo Gateway até existir uma camada de approval real.

## POSTs excluídos do catálogo de editabilidade

- `evaluateSafeWorkFn`: POST de avaliação bounded, sem persistência canônica.
- login/logout/sessão owner: mutação de infraestrutura de autenticação, regida pelo pacote de auth e não por capabilities de entidades do DevOS.
- previews determinísticos: leitura/preparação, sem commit de estado.

## Pilotos definidos

### `attention.transition`

- risco mínimo: `medium`;
- capability: `attention.write`;
- recurso: `attention:{attentionId}`;
- confirmação: `confirm_in_client` para o browser proprietário;
- concorrência: `expectedUpdatedAt`;
- idempotência: receipt durável do Gateway;
- undo: nova transição explícita, nunca remoção de histórico;
- estado inicial: registrar e testar antes de migrar o handler existente.

### `roadmap.stages.complete`

- risco mínimo: `high`;
- capability: `roadmap.stages.complete`;
- recurso: `project:{projectId}:stage:{stageId}`;
- confirmação: `approve_in_devos`;
- concorrência: `expectedProjectUpdatedAt` e `expectedStageUpdatedAt`;
- idempotência: receipt durável;
- undo: compensação explícita, não restauração silenciosa;
- estado inicial: registrado, mas não executável até existir approval store/consumption.

## Reservas confirmadas

- migration do Gateway: `0017_command_core.sql`;
- pacote framework-free: `packages/application` / `@semogtw/application`;
- nenhum uso de `0014`, `0016` ou outros números reservados por features anteriores;
- nenhum caminho MCP write nesta entrega;
- nenhum executor genérico de SQL, filesystem, shell, HTTP ou “qualquer comando”.

## Lacunas que o Gateway deve resolver

1. envelope canônico e versionado;
2. JSON canônico e hash determinístico;
3. registry e capabilities explícitas;
4. risco calculado no servidor;
5. outcomes `allow`, `confirm_in_client`, `prepare_approval`, `approve_in_devos`, `deny`;
6. receipts idempotentes com replay semântico e conflito de payload;
7. separação entre preparação, autorização e execução;
8. executor transacional que componha estado, auditoria e receipt;
9. manifests de cobertura por feature;
10. guardrail CI para impedir mutações sem classificação.

## Estado dos gates

Nenhum teste, typecheck, build ou workflow do novo branch foi executado nesta sessão. O ambiente conectado não possui checkout, Node 22/pnpm nem dispatch de workflow. Esta baseline é evidência de inventário, não evidência de gate verde.
