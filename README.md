# Semogtw Platform

Plataforma pessoal portátil composta por uma área pública editorial, o **Semogtw DevOS** privado e adapters sobre os mesmos contratos de domínio. O projeto permanece desacoplado de um provedor de hospedagem específico.

O stack principal usa TypeScript, TanStack Start/Router, React, Hono, Zod, Drizzle ORM, SQLite e pnpm workspaces.

> O seed demonstrativo existe apenas para exercitar a fundação. Ele não representa migração concluída do Notion, estado confirmado do GitHub nem progresso real de produção.

## Documentação essencial

- [Workflow orchestration core](docs/WORKFLOW_ORCHESTRATION.md) — reservas, gates, recuperação, fila segura, privacidade e evidências atuais.
- [Learning, Growth, Evidence and Credentials](docs/LEARNING_GROWTH.md) — direção aprovada para metas de aprendizado, checkpoints, evidências, certificados e workflows Spark; ainda não implementada.
- [Matriz de testes do workflow core](docs/testing/2026-08-03-workflow-orchestration-test-matrix.md) — comandos e resultados realmente observados.
- [Tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md) — download, checksums, remontagem, instalação sem rede, Chromium e SQLite nativo.
- [Arquitetura e fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md) — fronteiras, composição e decisões estruturais.
- [Índice de especificações](docs/superpowers/specs/README.md) — decisões aprovadas e seus limites.
- [Índice de planos](docs/superpowers/plans/README.md) — ordem executável e dependências.
- [Modelo de dados](docs/DATA_MODEL.md) — entidades, projeções, aliases e migrations implementadas.
- [Segurança](docs/security/README.md) — autenticação, privacidade, integrações e threat models.
- [Testes](docs/TESTING.md) — gates gerais, comandos e evidências observadas.
- [Runbook do ledger](docs/runbook/2026-08-01-cooperative-run-ledger.md) — operação e recuperação do fluxo cooperativo.

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

Pacotes/Apps planejados, ainda inexistentes, incluem `packages/mcp-auth`, `apps/mcp-http` e módulos Growth sob os pacotes existentes. A documentação de planejamento não deve ser interpretada como código implementado.

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

## Banco e migrations implementadas

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
10. `0010_editorial_redirect_registry.sql`;
11. `0011_scope_reservations.sql`;
12. `0012_verification_obligations.sql`;
13. `0013_recovery_snapshots.sql`.

O build web copia esses arquivos somente para o bundle de servidor e falha quando a lista empacotada diverge da fonte. As migrations não são publicadas em `dist/client`.

As migrations `0011`–`0013` adicionam coordenação cooperativa sem reescrever histórico:

- reservas de repositório/branch/escopo e eventos imutáveis;
- obrigações de verificação vinculadas a SHA completo;
- snapshots canônicos de recuperação com SHA-256 e idempotência.

Planejamento reserva `0014_mcp_oauth.sql`, `0015_learning_goals.sql` e `0016_learning_evidence_credentials.sql`; esses arquivos/tabelas não existem ainda e precisam ser reconciliados com a branch mais nova antes de implementação.

## Semogtw DevOS

As superfícies privadas implementadas incluem:

- Overview, Hoje, Projetos, hub e Roadmap;
- captura e ciclo de vida de atenção;
- handoff de sessões e evidências operacionais;
- conclusão guardada de etapas;
- Auditoria paginada;
- Operação GitHub somente leitura;
- ledger de execuções cooperativas, checkpoints e comandos locais;
- `/devos/workflows` para reservas, gates e próximo trabalho seguro;
- `/devos/workflows/recovery` para gerar e reutilizar handoffs imutáveis.

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

### Growth planejado — não implementado

A direção aprovada adiciona futuramente:

- metas privadas de aprendizado;
- checkpoints ordenados, ponderados e binários/numéricos;
- habilidades e estágios baseados em evidência;
- progresso derivado, sem campo/mutação direta de porcentagem;
- candidatos de evidência, claims, revisão e políticas determinísticas estreitas;
- certificados/credenciais com estados de verificação;
- referências exatas a evidências GitHub;
- extrações Gmail/Spark como propostas normalizadas, sem credenciais Gmail no site;
- seis leituras MCP Growth depois dos domínios e endpoint remoto verificados.

O Spark é um adapter/coordenador opcional. DevOS permanece canônico, e nenhum commit, extensão de arquivo, assunto de e-mail ou confiança de modelo prova aprendizado/completude sozinho.

## MCP somente leitura

`DevOSReadService` reutiliza os serviços de Overview, Today, Projetos e Roadmap. O catálogo inicial implementado contém:

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

Os catálogos de workflow/recovery e Growth descritos nos planos são futuros. Não há write scope/tool aprovado.

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

O gate focado do workflow core também executa:

- allowlist efêmera de `better-sql3` somente no checkout descartável do runner;
- scanners de fronteiras e confidencialidade pública;
- testes de domínio, migrations, backup e repositórios SQLite;
- typechecks de domínio, banco, UI e web;
- geração da árvore TanStack e build de produção;
- Playwright anônimo/autenticado e viewport de 360×800.

A evidência atual, os IDs das execuções e qualquer limitação permanecem registrados em [docs/testing/2026-08-03-workflow-orchestration-test-matrix.md](docs/testing/2026-08-03-workflow-orchestration-test-matrix.md). Não reutilize contagens antigas depois de alterar arquivos cobertos pelo gate.

O checkpoint offline observado em 3 de agosto de 2026 passou 157 arquivos / 600 testes, build de produção, validação das 13 migrations no SSR e 6/6 cenários Playwright do workflow core. O `pnpm check` agregado excedeu o limite externo somente durante a suíte monorepo; os mesmos testes passaram integralmente por workspace.

Planejamento/documentação posterior não constitui evidência de OAuth, endpoint remoto, Growth, certificados, Gmail/Spark ou novos MCP tools.

## Backup

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Os comandos recusam overwrite e verificam integridade, chaves estrangeiras e estado das migrations implementadas. Upload, criptografia e rotação continuam responsabilidades do runtime escolhido.

## Segurança

- autenticação e mutações privadas falham fechadas;
- tokens de sessão são persistidos apenas como digest;
- CSRF, confirmação, razão, versão esperada, idempotência e auditoria protegem mutações sensíveis;
- respostas públicas usam DTOs allowlist;
- nomes de repositório, branches, observações, recomendações, runs, reservas, gates, snapshots e payloads MCP permanecem privados;
- GitHub é tratado como fonte não confiável e acessado apenas por GET;
- nenhum token, authorization header ou corpo bruto do provider é persistido;
- snapshots rejeitam conteúdo com aparência de credencial e caminhos de documento inseguros;
- MCP não possui ferramenta de escrita nem transporte remoto;
- migrations e dependências nativas necessárias ao SSR são verificadas no build.

Futuros dados Growth, evidências, motivos pessoais, credential IDs, anexos e referências de e-mail permanecem igualmente privados e exigem DTOs/logs allowlist.

## Estado atual

Implementado e verificado por gates focados:

- fundação portátil e autenticação local;
- leituras e escritas operacionais auditadas;
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
- ciclo editorial owner-only completo com revisions imutáveis, diff textual limitado, análise sensível, aprovação por hash, publicação, retirada e rollback auditáveis;
- projeções públicas derivadas exclusivamente da revisão aprovada e publicada;
- renderer Markdown em elementos React, sem HTML bruto, com política restritiva de links;
- canonical provider-neutral em índices e projeções publicadas;
- registry append-only de aliases e redirects `308` sem cache persistente.

Ainda bloqueado, planejado ou pendente de fase separada:

- autenticação e transporte MCP remoto;
- workflow/recovery MCP read expansion;
- Growth goals/checkpoints/skills, evidence/credentials and Growth MCP reads;
- qualquer MCP write scope/tool, incluindo criação/propostas via Spark;
- validação de token/rate limit contra repositórios GitHub reais no runtime escolhido;
- adapter e deploy no host definitivo;
- migração de conteúdo real do Notion;
- observabilidade e operação de produção;
- campanhas, branch-divergence guidance e clustering de falhas CI além do núcleo atual.

## Referência upstream

A fundação avaliou seletivamente o upstream registrado em `docs/UPSTREAM_REFERENCE.md`. Conteúdo pessoal, taxonomia de PDI e identidade visual literal do projeto de referência não devem ser reintroduzidos. O novo Growth é um domínio Semogtw próprio, não uma cópia da taxonomia upstream.
