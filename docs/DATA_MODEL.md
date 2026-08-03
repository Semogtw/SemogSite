# Modelo de dados da Semogtw Platform

Este documento descreve o modelo SQLite versionado que sustenta o site público, o Semogtw DevOS privado e os adapters de leitura. A regra central é separar **estado operacional privado** de **conteúdo editorial público**: nenhuma tabela de projetos, repositórios, execuções ou evidências serve como fallback para uma página pública.

## Convenções

- IDs são strings estáveis geradas pela aplicação.
- Timestamps são persistidos em ISO 8601 UTC.
- Mutações sensíveis usam transação `IMMEDIATE`, idempotência e comparação otimista do estado esperado.
- Histórico editorial é append-only; revisões, reviews, eventos de publicação e eventos de redirect não são editados em lugar.
- JSON persistido é validado na entrada e novamente nos read models antes de ser exposto.

## Domínios operacionais privados

As migrations `0001`–`0005` criam a fundação do DevOS, incluindo projetos, atenção, auditoria, observações GitHub, execuções de sincronização e o ledger cooperativo. Esses registros podem conter branches, evidências, próximos passos e outros metadados internos. Eles permanecem atrás da autenticação owner e não são consultados pelos read models editoriais públicos.

## Workflow editorial

### `editorial_documents`

Representa a identidade estável e os ponteiros do agregado:

- `kind`: `project`, `note`, `experiment` ou `page`;
- `slug`: identidade canônica única e imutável;
- `workflow_status`: `draft`, `in_review` ou `approved`;
- `publication_status`: `unpublished`, `published` ou `withdrawn`;
- ponteiros para revisão de trabalho, aprovada, publicada e última publicação;
- `version`, `created_at` e `updated_at` para concorrência otimista.

A linha do documento não contém o corpo editorial. Alterar conteúdo sempre cria uma revisão imutável.

### `editorial_revisions`

Snapshot imutável de título, resumo, Markdown, tags e SHA-256 do conteúdo. A sequência é contígua por documento e independente da versão do agregado. Uma revisão publicada pode coexistir com uma revisão privada mais nova sem alterar a projeção pública.

### `editorial_reviews`

Registra a aprovação de uma revisão e de seu hash exato. Todos os checks de dados sensíveis, links, atribuição, alegações e segurança Markdown precisam estar afirmativos. Uma review não pode aprovar outra revisão por reaproveitamento de ponteiro.

### `editorial_publication_events`

Histórico append-only de criação, nova revisão, envio para review, reabertura, aprovação, publicação, retirada e rollback. Cada evento preserva `before`/`after`, ator, razão, correlação e chave de idempotência. O timestamp público vem do evento de publicação ou rollback correspondente à revisão publicada, não de atividade privada posterior.

## Registry de aliases editoriais

A migration `0010_editorial_redirect_registry.sql` adiciona `editorial_redirect_events`. Cada slug antigo possui uma sequência contígua de eventos:

```text
created → revoked → created → revoked …
```

Campos principais:

- `source_slug`: URL histórica, normalizada e limitada a 120 caracteres;
- `kind`: impede redirecionar uma nota para a superfície de projetos, por exemplo;
- `target_document_id`: documento canônico de destino;
- `sequence` e `action`: histórico append-only;
- `actor`, `reason`, `occurred_at`, `idempotency_key` e `correlation_id`: trilha auditável.

Triggers do SQLite garantem:

- sequência contígua por `source_slug`;
- transições válidas entre criação e revogação;
- conflito com qualquer slug canônico existente;
- destino do mesmo tipo e publicado no instante do evento;
- proibição de update e delete;
- idempotência global da tentativa.

O read model público resolve sempre nesta ordem:

1. busca o slug canônico publicado;
2. somente após miss, busca o evento mais recente do alias e exige `action = created`;
3. confirma tipo e destino ainda publicado;
4. retorna o slug canônico para um redirect `308` same-origin com `Cache-Control: no-store, max-age=0`.

A política `no-store` é deliberada: o status é permanente para SEO, mas o navegador não deve tornar uma revogação futura inobservável na mesma sessão.

## Projeção pública

A projeção pública seleciona apenas a revisão indicada por `published_revision_id` e o evento público correspondente. DTOs allowlist expõem somente campos editoriais revisados. Não há join ou fallback para tabelas operacionais privadas.

Conteúdo draft, em review, desconhecido, retirado ou alias revogado resulta em not-found público, sem canonical e com `noindex, nofollow`.

## Backup e restauração

`createVerifiedSqliteBackup` produz um snapshot file-backed e valida:

- `PRAGMA integrity_check = ok`;
- zero violações de foreign key;
- conjunto exato de migrations aplicadas;
- recusa de overwrite do destino.

O drill editorial versionado comprova que um snapshot preserva simultaneamente:

- a revisão pública atual;
- uma revisão privada mais nova;
- review e eventos imutáveis;
- o histórico de alias;
- a resolução do alias ativo após restauração.

## Migrations versionadas

1. `0001_foundation.sql`
2. `0002_seed_demo.sql`
3. `0003_github_observations.sql`
4. `0004_github_sync_runs.sql`
5. `0005_cooperative_run_ledger.sql`
6. `0006_editorial_workflow.sql`
7. `0007_editorial_invariant_triggers.sql`
8. `0008_editorial_approval_guards.sql`
9. `0009_editorial_document_identity_guards.sql`
10. `0010_editorial_redirect_registry.sql`

O build web copia as migrations somente para o bundle SSR e falha quando a lista empacotada diverge da fonte. Nenhuma migration deve aparecer em `dist/client`.
