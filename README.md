# Semogtw Platform

Plataforma pessoal portátil composta por uma área pública editorial, o **Semogtw DevOS** privado e adapters sobre contratos compartilhados de domínio. O projeto continua desacoplado de um único provedor, mas a direção de hospedagem escolhida é Cloudflare Workers + D1 para a plataforma, mantendo o adapter Node/SQLite como referência local e para superfícies ainda não portadas.

O stack principal usa TypeScript, TanStack Start/Router, React, Hono, Zod, Drizzle ORM, SQLite/D1 e pnpm workspaces.

> O seed demonstrativo existe apenas para exercitar a fundação. Ele não representa migração concluída do Notion, estado confirmado do GitHub nem progresso real de produção.

## Documentação essencial

- [Workflow orchestration core](docs/WORKFLOW_ORCHESTRATION.md) — reservas, gates, recuperação, fila segura, privacidade e evidências atuais.
- [Fundação Cloudflare Worker + D1](docs/deployment/2026-08-05-cloudflare-d1-foundation.md) — composição Worker/D1, auth, leituras privadas, migrations e bloqueios de promoção.
- [Deployment](DEPLOYMENT.md) — modos, gates, rollback e requisitos de produção.
- [Matriz de testes do workflow core](docs/testing/2026-08-03-workflow-orchestration-test-matrix.md) — comandos e resultados realmente observados.
- [Tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md) — download, checksums, remontagem, instalação sem rede, Chromium e SQLite nativo.
- [Arquitetura e fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md) — fronteiras, composição e decisões estruturais.
- [Modelo de dados](docs/DATA_MODEL.md) — entidades, projeções, aliases e migrations.
- [Segurança](docs/security/README.md) — autenticação, privacidade, integrações e threat models.
- [Testes](docs/TESTING.md) — gates gerais, comandos e evidências observadas.
- [Runbook do ledger](docs/runbook/2026-08-01-cooperative-run-ledger.md) — operação e recuperação do fluxo cooperativo.

## Estrutura

```text
apps/web               TanStack Start: site público e DevOS
apps/api               Hono: API runtime-neutral, Node/SQLite e Worker/D1
apps/mcp               composição SQLite → DevOSReadService → McpServer
packages/domain        regras e serviços sem framework
packages/contracts     schemas e DTOs públicos/privados
packages/database      Drizzle, SQLite/D1, migrations, writes e read models
packages/github        cliente REST GET-only e fonte de observações
packages/mcp           adapter MCP somente leitura, sem transporte
packages/auth          autenticação local, cookies, CSRF e sessões revogáveis
packages/ui            tokens, primitivas e navegação
packages/config        configuração tipada e fail-closed
```

## Requisitos locais

- Node.js 22;
- pnpm 10.14;
- binário ou toolchain compatível com `better-sqlite3` para o runtime Node/SQLite;
- acesso HTTPS ao GitHub somente quando observações reais forem executadas.

Em ambientes sem acesso direto ao npm, use os artifacts reproduzíveis de [`Semogtw/Offline-Toolchains`](https://github.com/Semogtw/Offline-Toolchains) e siga o [tutorial offline](docs/OFFLINE_TOOLCHAIN.md). Gates pesados e workflows de checkout devem ser centralizados nesse repositório público de toolchains quando possível.

## Instalação local

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
pnpm dev:api   # Hono/Node em http://localhost:3001
pnpm dev:all   # ambos
```

Sem autenticação válida, `/devos` e `/api/v1/private/*` falham fechados. Sem token GitHub, o cadastro e a revisão local de alvos continuam disponíveis, mas nenhuma leitura do provider é executada.

O Worker Cloudflare é composto por `apps/api/src/worker.ts` e `apps/api/src/composition/d1.ts`. O arquivo `apps/api/wrangler.jsonc` aponta apenas para o banco D1 de desenvolvimento. Não existe autorização implícita para deploy de produção.

Não existe transporte MCP remoto nesta fase. `apps/mcp` compõe o servidor somente leitura sem abrir HTTP, stdio ou outra porta.

## Banco e migrations

Uma base nova no `main` atual aplica, em ordem:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`;
5. `0005_cooperative_run_ledger.sql`;
6. `0006_editorial_workflow.sql`;
7. `0007_editorial_invariant_triggers.sql`;
8. `0008_editorial_approval_guards.sql`;
9. `0009_editorial_document_identity_guards.sql`;
10. `0010_editorial_redirect_registry.sql`;
11. `0011_scope_reservations.sql`;
12. `0012_verification_obligations.sql`;
13. `0013_recovery_snapshots.sql`;
14. `0014_login_rate_limits.sql`.

O build web mantém migrations apenas no bundle de servidor e deve falhar quando a lista empacotada diverge da fonte. As migrations não podem ser publicadas em `dist/client`.

`0011`–`0013` adicionam coordenação cooperativa sem reescrever histórico. `0014` adiciona persistência para limitação de tentativas de login compatível com D1.

A branch de Growth continua preservada na PR #24 e contém migrations posteriores (`0015`/`0015a`), mas não faz parte do `main` enquanto os conflitos estruturais com as linhas de desenvolvimento mais recentes não forem reconciliados.

## Semogtw DevOS

As superfícies privadas implementadas no `main` incluem:

- Overview, Hoje, Projetos, hub e Roadmap;
- captura e ciclo de vida de atenção;
- handoff de sessões e evidências;
- conclusão guardada de etapas;
- Auditoria paginada;
- Operação GitHub somente leitura;
- ledger de execuções cooperativas, checkpoints e comandos locais;
- `/devos/workflows` para reservas, gates e próximo trabalho seguro;
- `/devos/workflows/recovery` para gerar e reutilizar handoffs imutáveis;
- ciclo editorial owner-only com revisão, aprovação, publicação, retirada e rollback auditáveis.

### Workflow orchestration

A coordenação de desenvolvimento permanece provider-neutral:

- reservas são soft leases cooperativos, não locks do Git ou do sistema operacional;
- sobreposição é detectada por repositório, branch e escopo normalizado;
- override exige sessão owner, CSRF, motivo, confirmação, versão esperada e auditoria;
- gates diferenciam falha de código de ambiente ausente, timeout, quota, configuração, dependência externa e resultado desconhecido;
- resultados são vinculados a um SHA completo de 40 caracteres;
- snapshots usam somente branch aceita e observação GitHub persistida, recusando inventar um head;
- a fila segura recomenda somente a primeira etapa incompleta de projetos com exatamente um repositório ativo;
- capacidades de runtime não são presumidas nem persistidas: a reavaliação explícita vale apenas para a sessão exibida.

A sincronização GitHub nunca altera automaticamente branch ativa, papel, status do alvo ou `sync_enabled`. Aceitar uma recomendação modifica apenas o estado local auditado do DevOS e não escreve no GitHub.

## API Node e Cloudflare

Rotas atualmente compostas pela API compartilhada:

```text
GET  /health
GET  /api/v1/public/projects
GET  /api/v1/public/projects/:slug
GET  /api/v1/auth/session
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/private/overview
GET  /api/v1/private/today
GET  /api/v1/private/roadmap
GET  /api/v1/private/projects
GET  /api/v1/private/projects/:slug
GET  /api/v1/private/audit
GET  /api/v1/private/workflows
```

No Worker/D1, owner auth, sessão/revogação, login rate limiting e esses read models privados já possuem adapters D1. Ausência/invalidade dos secrets de autenticação mantém as rotas privadas fechadas.

Ainda não há paridade Worker/D1 para todas as mutações privadas do DevOS. Até essa portabilidade existir e for verificada, a implantação deve ser explicitamente dividida ou manter essas mutações no runtime Node/SQLite.

## MCP somente leitura

`DevOSReadService` reutiliza serviços de Overview, Today, Projetos e Roadmap. O catálogo inicial contém:

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

Todos os tools são somente leitura, não destrutivos e idempotentes. Entradas, saídas, limites de coleção, tamanho JSON e campos sensíveis são validados antes de responder.

Isso não constitui endpoint remoto. Exposição futura exige autenticação, autorização, isolamento de sessão, TLS, validação de Host/Origin, rate limiting, timeouts, cache privado, logging sanitizado, revogação e rollback.

## Gates

```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm check:cloudflare-worker-boundary
```

Quando o ambiente atual não consegue executar um gate por falta de toolchain, rede, quota ou runtime, a limitação deve ser documentada e o desenvolvimento deve seguir para tarefas resolvíveis por código. Não reutilize contagens de testes antigas depois de alterar arquivos cobertos pelo gate.

O checkpoint offline observado em 3 de agosto de 2026 passou 157 arquivos / 600 testes, build de produção, validação das 13 migrations então existentes no SSR e 6/6 cenários Playwright do workflow core. Essa evidência é histórica e não cobre `0014` nem os commits Cloudflare/D1 posteriores.

A documentação Cloudflare registra um dry-run e uma aplicação local D1 observados no primeiro slice de 5 de agosto; também são evidências históricas e devem ser reexecutadas para o head exato antes de promoção.

## Backup

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Os comandos recusam overwrite e verificam integridade, chaves estrangeiras e estado das migrations. Upload, criptografia e rotação continuam responsabilidades do runtime escolhido. Para D1 remoto, export/restore deve ser provado separadamente antes de produção.

## Segurança

- autenticação e mutações privadas falham fechadas;
- tokens de sessão são persistidos apenas como digest;
- CSRF, confirmação, razão, versão esperada, idempotência e auditoria protegem mutações sensíveis;
- login rate limiting possui persistência D1 no Worker;
- respostas públicas usam DTOs allowlist;
- nomes de repositório, branches, observações, recomendações, runs, reservas, gates, snapshots e payloads MCP permanecem privados;
- GitHub é tratado como fonte não confiável e acessado apenas por GET;
- nenhum token, authorization header ou corpo bruto do provider é persistido;
- snapshots rejeitam conteúdo com aparência de credencial e caminhos de documento inseguros;
- MCP não possui ferramenta de escrita nem transporte remoto;
- o Worker deve importar somente subpaths D1 explicitamente permitidos, sem carregar o adapter SQLite nativo.

## Estado atual

Implementado no `main`:

- fundação portátil e autenticação local;
- leituras e escritas operacionais auditadas no runtime Node/SQLite;
- backup, restauração e auditoria;
- integração GitHub somente leitura;
- recomendações e decisão local de branch;
- serviço de leitura compartilhado para adapters;
- catálogo MCP interno somente leitura;
- ledger cooperativo de execuções;
- reservas cooperativas de escopo com expiração e override owner-only;
- obrigações de verificação com classificação explícita e vínculo a SHA;
- snapshots de recuperação determinísticos, imutáveis e reutilizáveis;
- fila conservadora de próximo trabalho seguro e reavaliação por capacidades explícitas da sessão;
- ciclo editorial owner-only completo;
- projeções públicas derivadas exclusivamente da revisão aprovada e publicada;
- renderer Markdown em elementos React, sem HTML bruto, com política restritiva de links;
- canonical provider-neutral e registry append-only de aliases/redirects `308`;
- Worker Cloudflare + D1 para projetos públicos;
- autenticação owner, sessões revogáveis e login rate limiting em D1;
- read models privados de Overview, Hoje, Roadmap, Projetos, Auditoria e Workflows em D1;
- guardrail de boundary para impedir dependências Node/SQLite no Worker.

Pendente ou separado do `main`:

- paridade Worker/D1 para mutações privadas necessárias a um DevOS totalmente hospedado no Worker;
- migrations remotas, exportação/restauração e deploy preview Cloudflare;
- autenticação e transporte MCP remoto;
- validação de token/rate limit contra repositórios GitHub reais no runtime escolhido;
- migração de conteúdo real do Notion;
- observabilidade e operação de produção;
- campanhas, branch-divergence guidance e clustering de falhas CI além do núcleo atual;
- reconciliação da PR #24 de Growth, atualmente preservada mas conflitante com `main`.

## Referência upstream

A fundação avaliou seletivamente o upstream registrado em `docs/UPSTREAM_REFERENCE.md`. Conteúdo pessoal, taxonomia de PDI e identidade visual literal do projeto de referência não devem ser reintroduzidos.
