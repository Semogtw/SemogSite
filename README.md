# Semogtw Platform

Plataforma pessoal portátil composta por uma área pública editorial, o **Semogtw DevOS** privado e adapters sobre os mesmos contratos de domínio. O projeto permanece desacoplado de um provedor de hospedagem específico.

O stack principal usa TypeScript, TanStack Start/Router, React, Hono, Zod, Drizzle ORM, SQLite e pnpm workspaces.

> O seed demonstrativo existe apenas para exercitar a fundação. Ele não representa migração concluída do Notion, estado confirmado do GitHub nem progresso real de produção.

## Documentação essencial

- [Tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md) — download, checksums, remontagem, instalação sem rede, Chromium e SQLite nativo.
- [Arquitetura e fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md) — fronteiras, composição e decisões estruturais.
- [Modelo de dados](docs/DATA_MODEL.md) — entidades, projeções, aliases e migrations.
- [Segurança](docs/security/README.md) — autenticação, privacidade, integrações e threat models.
- [Testes](docs/TESTING.md) — gates, comandos e evidências observadas.
- [Runbook do ledger](docs/runbook/2026-08-01-cooperative-run-ledger.md) — operação e recuperação do fluxo cooperativo.
- [Especificação da fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md).
- [Plano da fundação](docs/superpowers/plans/2026-08-01-semogtw-platform-foundation.md).

## Estrutura

```text
apps/web               TanStack Start: site público e DevOS
apps/api               Hono: API pública/privada e runtime Node
apps/mcp               composição SQLite → DevOSReadService → McpServer
packages/domain        regras e serviços sem framework
packages/contracts     schemas e DTOs públicos/privados
packages/database      Drizzle, SQLite, migrations, writes e read models
packages/github        cliente REST GET-only e fonte de observações
packages/mcp           adapter MCP somente leitura, sem transporte
packages/auth          autenticação local e sessões revogáveis
packages/ui            tokens, primitivas e navegação
packages/config        configuração tipada e fail-closed
```

## Requisitos

- Node.js 22;
- pnpm 10.14;
- binário ou toolchain compatível com `better-sqlite3`;
- acesso HTTPS ao GitHub somente quando observações reais forem executadas.

Em ambientes sem acesso direto ao npm, use o artifact reproduzível de [`Semogtw/Offline-Toolchains`](https://github.com/Semogtw/Offline-Toolchains) e siga o [tutorial offline](docs/OFFLINE_TOOLCHAIN.md).

## Instalação

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm hash:owner-password
```

Copie o hash gerado para `SEMOGTW_OWNER_PASSWORD_HASH` e configure um segredo de sessão com pelo menos 32 caracteres:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use o resultado em `SEMOGTW_SESSION_SECRET`. Para observações GitHub, configure opcionalmente `SEMOGTW_GITHUB_TOKEN` somente no servidor, com permissões fine-grained de leitura restritas aos repositórios necessários.

## Desenvolvimento

```bash
pnpm dev       # web
pnpm dev:api   # Hono em http://localhost:3001
pnpm dev:all   # ambos
```

Sem autenticação válida, `/devos` e `/api/v1/private/*` falham fechados. Sem token GitHub, o cadastro e a revisão local de alvos continuam disponíveis, mas nenhuma leitura do provider é executada.

Não existe transporte MCP remoto nesta fase. `apps/mcp` compõe o servidor somente leitura sem abrir HTTP, stdio ou outra porta.

## Banco e migrations

Uma base nova aplica, em ordem:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`;
5. `0005_cooperative_run_ledger.sql`;
6. `0006_editorial_workflow.sql`;
7. `0007_editorial_invariant_triggers.sql`;
8. `0008_editorial_approval_guards.sql`;
9. `0009_editorial_document_identity_guards.sql`;
10. `0010_editorial_redirect_registry.sql`.

O build web copia esses arquivos somente para o bundle de servidor e falha quando a lista empacotada diverge da fonte. As migrations não são publicadas em `dist/client`.

## Semogtw DevOS

As superfícies privadas implementadas incluem:

- Overview, Hoje, Projetos, hub e Roadmap;
- captura e ciclo de vida de atenção;
- handoff de sessões e evidências;
- conclusão guardada de etapas;
- Auditoria paginada;
- Operação GitHub somente leitura;
- ledger de execuções cooperativas, checkpoints e comandos locais.

A sincronização GitHub nunca altera automaticamente branch ativa, papel, status do alvo ou `sync_enabled`. Aceitar uma recomendação modifica apenas o estado local auditado do DevOS e não escreve no GitHub.

## MCP somente leitura

`DevOSReadService` reutiliza os serviços de Overview, Today, Projetos e Roadmap. O catálogo inicial contém:

```text
Resources
semogtw://devos/overview
semogtw://devos/today
semogtw://devos/projects
semogtw://devos/roadmap

Tools
devos_get_overview
devos_get_today
devos_list_projects
devos_get_project
devos_query_roadmap
```

Todos os tools são anotados como somente leitura, não destrutivos e idempotentes. Entradas, saídas, limites de coleção, tamanho JSON e campos sensíveis são validados antes de responder.

Isso não constitui endpoint remoto. Exposição futura exige autenticação, autorização, isolamento de sessão, TLS, validação de Host/Origin, rate limiting, timeouts, cache privado, logging sanitizado, revogação e rollback.

## API local

Rotas iniciais:

```text
GET /health
GET /api/v1/public/projects
GET /api/v1/public/projects/:slug
GET /api/v1/private/overview
```

Endpoints privados autenticam antes de invocar serviços e retornam políticas de cache privadas.

## Gates

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Evidência observada no checkout da branch de desenvolvimento com Node `22.23.1` e o runner offline pnpm `11.15.1` (o `packageManager` do repositório permanece fixado em `10.14.0`):

- instalação offline com `pnpm-lock.yaml` frozen e zero downloads;
- guardrails e typechecks de todos os workspaces aprovados;
- suítes Vitest dos workspaces: **140 arquivos / 529 testes aprovados**;
- `pnpm test:guardrails`, typechecks e gates de fronteira executados separadamente do total Vitest;
- `pnpm build`: todos os workspaces, bundle cliente e SSR aprovados;
- bundle SSR contendo as 10 migrations e nenhuma migration no cliente;
- SQLite file-backed com `integrity_check=ok`, zero violações de foreign key e backup/restauração verificados;
- `pnpm test:e2e`: **2 cenários Playwright aprovados**, cobrindo login owner, ciclo editorial completo, checklist incompleto bloqueado, troca atômica da revisão pública, rollback, retirada, isolamento anônimo, canonical/noindex, teclado, console e viewport de 360×800;
- o adapter Node versionado serve `dist/client` e encaminha as demais requisições ao handler Fetch gerado em `dist/server/server.js`.

## Backup

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Os comandos recusam overwrite e verificam integridade, chaves estrangeiras e estado das migrations. Upload, criptografia e rotação continuam responsabilidades do runtime escolhido.

## Segurança

- autenticação e mutações privadas falham fechadas;
- tokens de sessão são persistidos apenas como digest;
- CSRF, confirmação, razão e auditoria protegem mutações sensíveis;
- respostas públicas usam DTOs allowlist;
- nomes de repositório, branches, observações, recomendações, runs e payloads MCP permanecem privados;
- GitHub é tratado como fonte não confiável e acessado apenas por GET;
- nenhum token, authorization header ou corpo bruto do provider é persistido;
- MCP não possui ferramenta de escrita nem transporte remoto;
- migrations e dependências nativas necessárias ao SSR são verificadas no build.

## Estado atual

Implementado e verificado:

- fundação portátil e autenticação local;
- leituras e escritas operacionais auditadas;
- backup, restauração e auditoria;
- integração GitHub somente leitura;
- recomendações e decisão local de branch;
- serviço de leitura compartilhado para adapters;
- catálogo MCP interno somente leitura;
- ledger cooperativo de execuções;
- ciclo editorial owner-only completo com revisions imutáveis, diff textual limitado, análise sensível, aprovação por hash, publicação, retirada e rollback auditáveis;
- projeções públicas de notas e projetos derivadas exclusivamente da revisão aprovada e publicada;
- renderer Markdown em elementos React, sem HTML bruto, com política restritiva de links;
- canonical provider-neutral em índices e projeções publicadas; conteúdo desconhecido ou retirado permanece sem canonical e com `noindex, nofollow`;
- registry append-only de aliases, com criação/revogação owner-only, resolução canonical-first e redirects `308` sem cache persistente;
- restauração verificada preservando simultaneamente a projeção pública, um rascunho privado mais novo e o histórico de alias;
- lockfile determinístico e **529 testes Vitest** distribuídos por 140 arquivos de workspace.

Ainda bloqueado ou pendente de uma fase separada:

- autenticação e transporte MCP remoto;
- validação de token/rate limit contra repositórios GitHub reais no runtime escolhido;
- adapter e deploy no host definitivo;
- migração de conteúdo real do Notion;
- observabilidade e operação de produção.

## Referência upstream

A fundação avaliou seletivamente o upstream registrado em `docs/UPSTREAM_REFERENCE.md`. Conteúdo pessoal, taxonomia de PDI e identidade visual literal do projeto de referência não devem ser reintroduzidos.
