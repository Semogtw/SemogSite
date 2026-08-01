# Semogtw Platform

Plataforma pessoal portátil composta por:

- site público editorial;
- aplicação privada **Semogtw DevOS** em `/devos`;
- API Hono versionada;
- integração GitHub somente leitura;
- contratos compartilhados para um futuro adaptador MCP.

O repositório está em desenvolvimento. O seed demonstrativo não representa migração concluída do Notion, estado confirmado do GitHub ou progresso real de produção.

## Arquitetura resumida

```text
apps/web               TanStack Start: site público e DevOS
apps/api               Hono: API pública/privada e runtime Node
packages/domain        regras e serviços sem framework
packages/contracts     schemas e DTOs públicos/privados
packages/database      Drizzle, SQLite, migrations, writes e read models
packages/github        cliente REST GET-only e fonte de observações
packages/auth          autenticação local e sessões revogáveis
packages/ui            tokens, primitivas e navegação
packages/config        configuração tipada e fail-closed
```

## Requisitos locais

- Node.js 22 ou superior;
- pnpm 10;
- compilador nativo para `better-sqlite3` quando não houver binário compatível;
- acesso HTTPS ao GitHub apenas para executar observações reais.

## Instalação

```bash
corepack enable
pnpm install --frozen-lockfile=false
cp .env.example .env
pnpm hash:owner-password
```

Copie o hash para `SEMOGTW_OWNER_PASSWORD_HASH` e gere um segredo de sessão:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie o resultado para `SEMOGTW_SESSION_SECRET`. Os campos sensíveis permanecem vazios em `.env.example`.

Para observações GitHub, configure opcionalmente `SEMOGTW_GITHUB_TOKEN` somente no servidor. Use um token fine-grained restrito aos repositórios necessários, com Metadata read e Contents read. Nenhuma permissão de escrita é necessária.

## Desenvolvimento

```bash
pnpm dev       # web
pnpm dev:api   # Hono em http://localhost:3001
pnpm dev:all   # ambos
```

Sem autenticação válida, `/devos` e `/api/v1/private/*` falham fechados. Sem token GitHub, a página Operação continua disponível para cadastro local de alvos, mas o botão de leitura fica desabilitado.

## Banco e migrations

Uma base nova aplica automaticamente:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`.

`0004` estende o `sync_runs` legado sem remover `trigger`, `repositories_checked` ou `changes_applied`. Backups e restaurações devem conter as quatro migrations.

O seed cria apenas um projeto/etapa privados `seed_demo` e nenhum alvo GitHub. O catálogo público permanece vazio até existir conteúdo editorial aprovado.

## Semogtw DevOS

As superfícies privadas implementadas incluem:

- Overview, Hoje, Projetos, hub e Roadmap com SQLite;
- captura e ciclo de vida de atenção;
- handoff de sessões;
- evidência manual e conclusão guardada de etapas;
- Auditoria paginada;
- Operação GitHub.

Em **Operação**, o owner pode:

- cadastrar um alvo privado sem SQL e sem enviar token pelo navegador;
- pausar ou reativar observações sem apagar histórico;
- executar uma leitura limitada e confirmada do GitHub;
- revisar runs, warnings, rate limit e recomendações;
- aceitar localmente a recomendação mais recente com motivo e auditoria.

A sincronização nunca altera automaticamente `active_branch`, papel, status do alvo ou `sync_enabled`. Aceitar uma recomendação modifica apenas o estado local do DevOS e não envia escrita ao GitHub.

## API local

Rotas iniciais:

```text
GET /health
GET /api/v1/public/projects
GET /api/v1/public/projects/:slug
GET /api/v1/private/overview
```

Endpoints privados autenticam antes dos serviços e retornam `Cache-Control: no-store, private`.

## Gates

```bash
pnpm check
pnpm build
```

`pnpm check` executa guardrails, scanners, fronteiras, typecheck e testes recursivos — incluindo `@semogtw/github`.

O primeiro install válido deve gerar e commitar `pnpm-lock.yaml`. O ambiente conectado atual não resolve `registry.npmjs.org`; por isso, typecheck, Vitest e build ainda não são declarados aprovados.

## Backup

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Os comandos recusam overwrite, verificam integridade, chaves estrangeiras e estado de migrations. Não fazem upload, criptografia ou rotação automática.

## Segurança

- autenticação e mutações privadas falham fechadas;
- tokens de sessão são persistidos apenas como digest;
- CSRF, confirmação, razão e auditoria protegem mutações sensíveis;
- respostas e DTOs públicos são allowlist;
- nomes de repositório, URLs, branches, observações, recomendações e runs são privados;
- GitHub é tratado como fonte de dados não confiável;
- o cliente GitHub implementa apenas GET, valida identidade/HTTPS e interrompe leituras posteriores após rate limit;
- nenhum token, authorization header ou corpo bruto do provider é persistido.

Consulte `SECURITY.md`, `DATA_MODEL.md`, `TESTING.md` e `RUNBOOK.md` antes de alterar integrações ou superfícies públicas.

## Estado atual

Implementado em código e salvo na branch de desenvolvimento:

- fundação portátil e autenticação local;
- leituras e escritas operacionais auditadas;
- backup e auditoria;
- integração GitHub somente leitura;
- cadastro e ciclo de vida de alvos;
- recomendações e decisão local de branch;
- migrations e documentação de continuidade.

Ainda não concluído:

- instalação integral e lockfile em ambiente com registry;
- execução de typecheck, Vitest, build e browser E2E;
- validação do token/provider em runtime real;
- adaptador de produção para o host escolhido;
- migração Notion;
- MCP;
- conteúdo editorial real aprovado;
- deploy público.

## Referência upstream

A fundação avaliou seletivamente o upstream registrado em `UPSTREAM_REFERENCE.md`. Nenhum conteúdo pessoal, taxonomia de PDI ou identidade visual literal deve ser reintroduzido.
