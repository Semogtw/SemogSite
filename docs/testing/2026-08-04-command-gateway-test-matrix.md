# Command Gateway — matriz de testes

## Regra de evidência

Nenhuma linha recebe estado `passed` sem saída observada no SHA exato. Nesta sessão, todos os gates executáveis permanecem `not_run_environment` porque não há checkout, Node 22/pnpm ou workflow dispatch.

## Core framework-free

| Gate | Comando esperado | Estado | Falha que deve detectar |
|---|---|---|---|
| application unit tests | `pnpm --filter @semogtw/application test` | not_run_environment | canonicalização, registry, policy, replay ou executor incorretos |
| application typecheck | `pnpm --filter @semogtw/application typecheck` | not_run_environment | contratos inconsistentes e imports inválidos |
| package boundaries | `pnpm check:boundaries` | not_run_environment | React, TanStack, ORM, SQLite, MCP SDK, fs, rede ou shell no pacote |
| deterministic JSON | teste focado de canonical JSON | not_run_environment | ordem de chaves/arrays, valores não JSON, ciclos e números inválidos |
| deterministic hash | teste focado SHA-256 | not_run_environment | hash distinto para payload semanticamente igual |

## Registry e policy

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| command IDs únicos e versionados | not_run_environment | colisão, versão inválida ou runner ausente |
| capabilities/resources bounded | not_run_environment | recurso vazio, capability genérica ou self-escalation |
| risk floor monotônico | not_run_environment | cliente reduzindo medium/high |
| owner-browser matrix | not_run_environment | low bloqueado indevidamente, medium sem confirmação, high executável sem approval |
| unknown command deny-by-default | not_run_environment | dispatch de comando não registrado |
| stage completion blocked | not_run_environment | runner high-risk chamado antes de approval store |

## Receipts e migration `0017`

| Gate | Comando esperado | Estado | Falha que deve detectar |
|---|---|---|---|
| migration order/idempotency | database migration tests | not_run_environment | `0017` ausente, duplicado ou usando número reservado |
| receipt schema constraints | database tests | not_run_environment | status inválido, hash vazio, payload bruto ou owner/resource ausente |
| atomic claim | database tests | not_run_environment | dois executores assumindo a mesma tentativa |
| exact replay | database tests | not_run_environment | segunda execução do mesmo payload |
| payload conflict | database tests | not_run_environment | mesma chave reaproveitada com hash diferente |
| stable error replay | database tests | not_run_environment | domínio executado novamente após erro final |
| lease expiry | database tests | not_run_environment | tentativa `in_progress` abandonada permanentemente ou roubada cedo |
| no secrets in receipt | database tests | not_run_environment | token/cookie/payload sensível persistido |
| backup/restore | database backup tests | not_run_environment | receipts/migration perdidos ou divergentes |

## Executor transacional

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| state + audit + receipt commit together | not_run_environment | qualquer estado parcial |
| mutation failure rollback | not_run_environment | estado/audit sem receipt final |
| audit serialization failure rollback | not_run_environment | mutação confirmada sem trilha auditável |
| result hash verification | not_run_environment | receipt marcado succeeded com resultado divergente |
| async runner forbidden in sync SQLite executor | not_run_environment | Promise escapando da transação |
| external side effects excluded | not_run_environment | rede/processo dentro do executor SQLite |

## Piloto Attention

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| prepare `attention.transition` | not_run_environment | schema, resource ou risk incorretos |
| medium without confirmation | not_run_environment | runner chamado |
| medium with owner confirmation | not_run_environment | policy ainda bloqueia ou receipt não é criado |
| expectedUpdatedAt conflict | not_run_environment | stale update confirmado |
| replay same request | not_run_environment | novo audit/evento duplicado |
| same key changed payload | not_run_environment | payload divergente aceito |
| browser parity | not_run_environment | resultado diferente do serviço canônico |
| invalid CSRF before gateway | not_run_environment | storage/gateway aberto antes da autorização |

## Stage completion high-risk

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| registry entry exists | not_run_environment | comando invisível à cobertura |
| owner confirmation only | not_run_environment | execução com `confirmed: true` sem approval |
| approval missing/expired/stale | not_run_environment | runner chamado |
| approval hash mismatch | not_run_environment | payload alterado após aprovação |
| runner absent in this phase | not_run_environment | execução accidental high-risk |

## Manifests e cobertura

| Gate | Estado | Falha que deve detectar |
|---|---|---|
| feature manifest schema | not_run_environment | risco/confirmação/conflito/undo/audit ausentes |
| command registry coverage | not_run_environment | command sem manifest |
| mutation source scan | not_run_environment | novo POST/write sem catalogação ou exceção explícita |
| no generic command/tool | not_run_environment | `updateAnything`, SQL genérico, shell ou HTTP arbitrário |
| generated docs deterministic | not_run_environment | catálogo divergente entre execuções |

## Regressão do monorepo

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:boundaries
pnpm check:editability-coverage
pnpm check
pnpm build
pnpm exec playwright test tests/e2e/attention-command-gateway.spec.ts
```

## Gates manuais futuros

- aprovação DevOS high-risk com diff/hash visível;
- expiração e invalidação por estado stale;
- UI de receipts/auditoria sem payload sensível;
- generic MCP client somente após autenticação remota e toolset existirem;
- browser, MCP e outro cliente convergindo no mesmo receipt/domínio.
