# Semogtw audited editorial redirect registry

**Goal:** preservar URLs editoriais históricas sem transformar aliases em fallback inseguro, sem esconder revogações no cache do navegador e sem reescrever histórico.

## Produto e segurança

- [x] Slug canônico continua único e imutável.
- [x] Alias é explícito, owner-only, confirmado e acompanhado de razão.
- [x] Destino precisa existir, ter o mesmo `kind` e estar publicado.
- [x] Alias nunca aponta para dados operacionais privados.
- [x] Resolução tenta canonical antes de alias.
- [x] Alias desconhecido ou revogado resulta em not-found/noindex.

## Domínio

- [x] Contratos `created | revoked` append-only.
- [x] Validação de slug, IDs, timestamp, razão e confirmação.
- [x] Replay idempotente aceita somente intenção idêntica.
- [x] Conflitos distinguem canonical, destino, tipo, estado ativo e concorrência.
- [x] Reativação exige novo evento após revogação; nenhum evento é alterado.

## Persistência

- [x] Migration `0010_editorial_redirect_registry.sql`.
- [x] Sequência contígua por source slug.
- [x] Triggers de transição, destino publicado, imutabilidade e delete proibido.
- [x] Repositório SQLite com transação `IMMEDIATE` e expectativa do último evento.
- [x] Owner read model inclui histórico append-only.
- [x] Public read model usa apenas o último evento ativo e destino ainda publicado.

## Superfície owner

- [x] Formulário de criação com CSRF, idempotência, razão e confirmação.
- [x] Revogação explícita por alias ativo.
- [x] Histórico completo visível no detalhe privado.
- [x] Novos aliases bloqueados quando o destino não está publicado.

## Superfície pública

- [x] Redirect same-origin `308` para a rota canônica do mesmo tipo.
- [x] `Cache-Control: no-store, max-age=0` para tornar revogação observável.
- [x] Canonical publicado continua sendo a única URL indexável.
- [x] Alias revogado não recebe canonical e permanece `noindex`.

## Evidência

- [x] Domínio: criação, replay, conflito, revogação e reativação.
- [x] Banco: migration, triggers, atomicidade, read models e histórico owner.
- [x] Web: resolução canonical-first e contratos de rota.
- [x] Playwright: criação, `308`, `Location`, `no-store`, navegação, revogação e not-found na mesma sessão.
- [x] Backup: restaura alias ativo junto da publicação e do draft privado mais novo.

## Estado

Implementação concluída no branch `develop/editorial-workspace`. Permanecem fora deste plano os gates específicos do host definitivo: CSP, trusted origins, proxy/cache externo, canonical origin e observabilidade de produção.
