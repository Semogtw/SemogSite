# Command Gateway — matriz de testes

## Regra de evidência

Nenhuma linha recebe estado `passed` sem saída observada no SHA exato. Nesta sessão, todos os gates executáveis permanecem `not_run_environment` porque não há checkout, Node 22/pnpm ou workflow dispatch.

O branch contém testes para os comportamentos abaixo, mas sua presença não é tratada como execução bem-sucedida.

## Core framework-free

| Gate | Comando esperado | Estado | Falha que deve detectar |
|---|---|---|---|
| application unit tests | `pnpm --filter @semogtw/application test` | not_run_environment | canonicalização, registry, policy, manifests ou discovery incorretos |
| application typecheck | `pnpm --filter @semogtw/application typecheck` | not_run_environment | contratos inconsistentes e imports inválidos |
| application in Vitest workspace | `pnpm test` | not_run_environment | package sem `vitest.config.ts` sendo ignorado |
| package boundaries | `pnpm check:boundaries` | not_run_environment | React, TanStack, ORM, SQLite, MCP SDK, Node runtime, fs, rede ou shell no pacote |
| deterministic JSON | teste focado de canonical JSON | not_run_environment | ordem de chaves/arrays, valores não JSON, ciclos e números inválidos |
| Web Crypto hash | teste focado SHA-256 | not_run_environment | hash distinto para payload semanticamente igual ou dependência `node:crypto` no application runtime |
| public package surface | application public-surface test | not_run_environment | consumers obrigados a usar imports internos |

## Registry e policy

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| command IDs únicos e versionados | not_run_environment | colisão ou versão inválida |
| capabilities/resources bounded | not_run_environment | recurso vazio, capability genérica ou self-escalation |
| risk floor monotônico | not_run_environment | cliente reduzindo medium/high |
| owner-browser matrix | not_run_environment | low bloqueado indevidamente, medium sem confirmação, high executável sem approval |
| unknown command deny-by-default | not_run_environment | dispatch de comando não registrado |
| stage completion registered-blocked | not_run_environment | runner high-risk chamado antes de approval store |
| fake client approval rejected | not_run_environment | `approvalId` fornecido pelo cliente autorizando high-risk |

## Receipts e migrations `0017`/`0017a`

| Gate | Comando esperado | Estado | Falha que deve detectar |
|---|---|---|---|
| migration order/idempotency | database migration tests | not_run_environment | migrations ausentes, duplicadas ou fora da reserva |
| receipt schema constraints | database tests | not_run_environment | status inválido, hash vazio, payload bruto ou identidade ausente |
| semantic uniqueness | database tests | not_run_environment | mesma principal/command/key executando outro recurso |
| atomic claim | database tests | not_run_environment | dois executores assumindo a mesma tentativa |
| exact replay | database tests | not_run_environment | segunda execução do mesmo payload |
| payload conflict | database tests | not_run_environment | mesma chave reaproveitada com hash diferente |
| stable error replay | database tests | not_run_environment | domínio executado novamente após erro final |
| lease expiry | database tests | not_run_environment | tentativa abandonada ou roubada cedo |
| recovered receipt context | database tests | not_run_environment | retry alterando receipt ID, resource ou correlation auditada |
| no secrets in receipt | database tests | not_run_environment | token/cookie/payload sensível persistido |
| backup/restore | database backup tests | not_run_environment | receipts/migrations perdidos ou divergentes |

## Executor transacional

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| state + audit + receipt commit together | not_run_environment | qualquer estado parcial |
| mutation failure rollback | not_run_environment | estado/audit sem receipt final |
| audit missing/serialization rollback | not_run_environment | mutação confirmada sem trilha auditável |
| result hash verification | not_run_environment | receipt succeeded com resultado divergente |
| async runner forbidden | not_run_environment | Promise escapando da transação `better-sqlite3` |
| external side effects excluded | not_run_environment | rede/processo dentro do executor SQLite |
| commands subpath surface | database public-surface test | not_run_environment | web importando repositories/composition internos |

## Piloto Attention

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| strict `attention.transition` definition | not_run_environment | schema, metadata ou resource incorretos |
| pure domain validation/planning | not_run_environment | regra duplicada entre caminho legado e Gateway |
| sync repository parity | not_run_environment | runner transacional persistindo diferente do repository canônico |
| medium without confirmation | not_run_environment | receipt ou runner chamado |
| medium with owner confirmation | not_run_environment | policy bloqueando ou receipt ausente |
| expectedUpdatedAt conflict | not_run_environment | stale update confirmado |
| replay same request | not_run_environment | novo audit/evento duplicado |
| same key changed payload | not_run_environment | payload divergente aceito |
| invalid CSRF before gateway | not_run_environment | storage/gateway aberto antes da autorização |
| browser server-owned metadata | not_run_environment | cliente escolhendo command, capability, principal ou resource kind |
| Today concurrency projection | not_run_environment | formulário sem timestamp canônico observado |

## Stage completion high-risk

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| registry entry exists | not_run_environment | comando invisível à cobertura |
| owner confirmation only | not_run_environment | execução com `confirmed: true` sem approval |
| client approval ID ignored | not_run_environment | valor não verificado baixando a policy |
| no receipt before approval | not_run_environment | criação de tentativa high-risk sem approval executor |
| runner absent in this phase | not_run_environment | execução acidental high-risk |
| legacy browser path preserved | not_run_environment | migração prematura sem approval store |

## Manifests e owner action discovery

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| shared catalog schema | not_run_environment | risco/confirmação/conflito/undo/audit ausentes |
| command registry coverage | not_run_environment | command sem manifest |
| adapter/source scan | not_run_environment | Gateway adapter não catalogado ou marker divergente |
| route existence | not_run_environment | manifest apontando para UI inexistente |
| no false completion | not_run_environment | feature `complete` com MCP `not_yet` |
| exact resource resolution | not_run_environment | actions para recurso ausente/terminal/unsupported |
| owner before database | not_run_environment | existência privada consultada sem sessão |
| bounded discovery response | not_run_environment | schema, capability, handler, principal ou payload retornado |
| human disclosure | not_run_environment | command IDs técnicos exibidos ao proprietário |
| Stage shown as planned | not_run_environment | ação bloqueada parecendo disponível |

## Confidencialidade e E2E

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| public confidentiality | not_run_environment | labels, command IDs ou receipt IDs no HTML público |
| anonymous owner redirect | not_run_environment | action metadata renderizada antes de autenticação |
| Attention capture→discover→resolve | not_run_environment | UI não convergindo no Gateway canônico |
| resolved item leaves Today queue | not_run_environment | mutação confirmada sem projeção atualizada |
| Stage discovery planned | not_run_environment | comando high apresentado como executável |
| responsive disclosure | not_run_environment | overflow ou alvo de toque inadequado |

E2E focado:

```text
pnpm exec playwright test tests/e2e/command-gateway-owner-parity.spec.ts
```

## Regressão do monorepo

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:editability-coverage
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm check
pnpm build
pnpm exec playwright test tests/e2e/command-gateway-owner-parity.spec.ts
```

## Known setup blocker

`pnpm-lock.yaml` has not been regenerated in this session. The branch adds:

```text
packages/application workspace importer
packages/database dependency on @semogtw/application
```

`pnpm install --frozen-lockfile` must be expected to fail until `pnpm install --lockfile-only` is executed in a valid Node 22/pnpm environment and the resulting lockfile diff is reviewed.

## Gates manuais futuros

- immutable DevOS approval with recent authentication and payload/version binding;
- expiry, revocation and stale invalidation of approvals;
- owner receipt/audit view without raw payload or secrets;
- generic MCP client only after authenticated remote read gates and authorization exist;
- browser, MCP and another authorized client converging on the same receipt/domain command.
