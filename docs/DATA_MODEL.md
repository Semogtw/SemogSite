# Modelo de dados da Semogtw Platform

Este documento descreve o modelo SQLite versionado que sustenta o site público, o Semogtw DevOS privado e os adapters de leitura. A regra central é separar **estado operacional privado** de **conteúdo editorial público**: nenhuma tabela de projetos, repositórios, execuções, reservas, gates, snapshots ou evidências serve como fallback para uma página pública.

## Convenções

- IDs são strings estáveis geradas pela aplicação.
- Timestamps são persistidos em ISO 8601 UTC.
- Mutações sensíveis usam transação `IMMEDIATE`, idempotência e comparação otimista do estado esperado.
- Histórico editorial e operacional crítico é append-only.
- JSON persistido é validado na entrada e novamente nos read models antes de ser exposto.
- Expiração e staleness são derivadas no momento da leitura; nenhuma tabela depende de scheduler para ficar semanticamente correta.
- Branches e commits externos são observações persistidas, não fatos implícitos inventados pela aplicação.

## Domínios operacionais privados

As migrations `0001`–`0005` criam a fundação do DevOS, incluindo projetos, atenção, auditoria, observações GitHub, execuções de sincronização e o ledger cooperativo. Esses registros podem conter branches, evidências, próximos passos e outros metadados internos. Eles permanecem atrás da autenticação owner e não são consultados pelos read models editoriais públicos.

As migrations `0011`–`0013` adicionam o workflow orchestration core: reservas cooperativas, obrigações de verificação e snapshots de recuperação imutáveis.

## Reservas cooperativas de escopo

### `scope_reservations`

Representa um soft lease privado para coordenar trabalho concorrente. Campos principais:

- `project_id`, opcional, associa a reserva ao projeto;
- `repository_id`, obrigatório, referencia um alvo persistido;
- `run_id`, opcional, associa ownership operacional a uma execução cooperativa;
- `branch`, identidade exata da branch declarada;
- `kind`: `repository`, `directory`, `files`, `issue`, `stage` ou `custom`;
- `patterns_json`, array JSON normalizado de caminhos/identificadores;
- `holder_label` e `purpose`, descrição humana limitada;
- `state`: `active`, `released`, `transferred` ou `overridden`;
- `acquired_at`, `renewed_at`, `expires_at` e `released_at`;
- `version`, usado por compare-and-swap.

A linha persistida não é um lock do Git ou do filesystem. Uma reserva `active` cujo `expires_at` já passou é lida como expirada e deixa de bloquear o avaliador, sem exigir update automático.

### `scope_reservation_events`

Histórico imutável de:

```text
scope_reservation.acquire
scope_reservation.renew
scope_reservation.release
scope_reservation.override
```

Cada evento preserva sequência contígua, ator, `before_json`, `after_json`, razão, IDs de overlap, timestamp, origem, confirmação, chave de idempotência e correlação. O evento e o `audit_events` correspondente são gravados na mesma transação da entidade.

## Obrigações de verificação

### `verification_obligations`

Registra um gate ainda necessário ou um resultado observado para branch e SHA exatos.

Campos principais:

- `project_id`, `repository_id`, `run_id` e `stage_id`;
- `branch` e `target_commit_sha` completo de 40 caracteres hexadecimais;
- `gate_name` e `command` exato;
- `required_capabilities_json`;
- `responsible_actor`, `next_action` e `toolchain_manifest` opcional;
- `status`: `pending`, `running`, `passed`, `failed`, `blocked`, `superseded` ou `waived`;
- `failure_classification`: `code_failure`, `environment_missing`, `flaky`, `timeout`, `quota`, `configuration`, `external_dependency` ou `unknown`;
- `failure_signature`, `result_summary` e `evidence_urls_json`;
- `created_at`, `last_attempt_at`, `resolved_at` e `version`.

Invariantes relevantes:

- um gate aprovado não pode carregar classificação ou assinatura de falha;
- `failed` e `blocked` exigem classificação, assinatura, resumo e tentativa observada;
- estados terminais exigem `resolved_at`;
- ausência de ambiente é representada separadamente de regressão de código.

### `verification_obligation_events`

Histórico imutável de criação, resultado, supersede e waiver. A sequência e a chave de idempotência são únicas por obrigação; toda alteração também gera `audit_events` na mesma transação.

## Snapshots de recuperação

### `recovery_snapshots`

Preserva um handoff canônico depois de reset de sessão, troca de agente ou mudança de provedor.

Campos principais:

- projeto, repositório e `run_id` opcional;
- branch aceita e `observed_commit_sha` completo;
- `schema_version = 1`;
- `generated_at` e `source_observed_at`;
- `confidence`: `high`, `medium` ou `low`;
- `canonical_json`, objeto JSON validado;
- `canonical_hash`, SHA-256 hexadecimal único;
- `markdown`, limitado a 20.000 caracteres;
- `template_id` e `template_version` do prompt de continuação;
- `created_by`, `source`, `idempotency_key` e `correlation_id`.

A tabela é imutável por contrato de repositório: não existe método de update. O mesmo hash canônico não cria outra linha, e a mesma intenção idempotente com conteúdo alterado resulta em conflito.

O read model de histórico retorna no máximo 100 linhas e a UI privada usa as 20 mais recentes, ordenadas por geração decrescente.

## Fonte de próximo trabalho seguro

Não existe tabela materializada de recomendações. `SqliteSafeWorkSource` compõe projeções a partir de:

- `projects` e sua prioridade, health, confidence e manual lock;
- `stages`, usando somente a primeira etapa incompleta;
- `repositories`, exigindo exatamente um alvo ativo por projeto;
- `scope_reservations`, para conflitos de escopo ativos;
- `verification_obligations`, para gates de etapa e capacidades exigidas.

Projetos seed demonstrativos são ignorados. Ausência ou ambiguidade de repositório, etapa anterior incompleta, owner lock, capacidade ausente, reserva conflitante e gate não resolvido geram exclusões explicáveis; nenhum vínculo é adivinhado ou persistido.

A reavaliação web recebe capacidades explicitamente digitadas pelo proprietário e não as armazena. O read inicial usa conjunto vazio.

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

Scanners estáticos e Playwright verificam que nomes e marcadores de reservas, gates e snapshots não aparecem na home anônima.

## Backup e restauração

`createVerifiedSqliteBackup` produz um snapshot file-backed e valida:

- `PRAGMA integrity_check = ok`;
- zero violações de foreign key;
- conjunto exato de migrations aplicadas;
- recusa de overwrite do destino.

O backup preserva também reservas, eventos, obrigações, snapshots canônicos e seus audit events. A restauração não reclassifica expiração: a freshness continua sendo derivada pela hora da leitura.

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
11. `0011_scope_reservations.sql`
12. `0012_verification_obligations.sql`
13. `0013_recovery_snapshots.sql`

O build web copia as migrations somente para o bundle SSR e falha quando a lista empacotada diverge da fonte. Nenhuma migration deve aparecer em `dist/client`.