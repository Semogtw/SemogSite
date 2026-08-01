# Semogtw Platform

Plataforma pessoal portátil composta por:

- site público editorial;
- aplicação privada **Semogtw DevOS** em `/devos`;
- API versionada compartilhada com um futuro adaptador MCP.

O repositório está em implementação inicial. Nenhum dado demonstrativo representa uma migração concluída do Notion ou um estado confirmado do GitHub.

## Arquitetura resumida

```text
apps/web               TanStack Start: site público e DevOS
apps/api               Hono: API pública e privada
packages/domain        regras e serviços sem framework
packages/contracts     schemas e DTOs públicos/privados
packages/database      Drizzle, SQLite, migrations e repositórios
packages/auth          autenticação local e sessões revogáveis
packages/ui            tokens, primitivas e navegação
packages/config        configuração tipada e fail-closed
```

## Requisitos locais

- Node.js 22 ou superior;
- pnpm 10;
- compilador nativo disponível para `better-sqlite3` quando não houver binário pré-compilado.

## Instalação

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm hash:owner-password
```

Copie o hash produzido para `SEMOGTW_OWNER_PASSWORD_HASH`. Gere também um segredo aleatório de sessão, sem reutilizar o exemplo:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie o resultado para `SEMOGTW_SESSION_SECRET`. As duas variáveis permanecem vazias no `.env.example` para que uma cópia não configure uma credencial previsível por acidente.

## Desenvolvimento

```bash
pnpm dev
```

O adaptador local cria o diretório do banco, aplica migrations idempotentes e configura o `LocalAuthProvider` no primeiro acesso server-side. Sem hash, segredo ou banco gravável, `/devos` continua falhando fechado.

## Gates

```bash
pnpm check
pnpm build
```

`pnpm check` executa:

1. testes dos guardrails sem dependências externas;
2. scanner de conteúdo residual do upstream;
3. verificação de fronteiras do domínio;
4. scanner estático das superfícies públicas de saída;
5. typecheck dos workspaces;
6. testes automatizados.

## Segurança

- `/devos` e `/api/v1/private/*` falham fechados sem configuração de autenticação;
- tokens de sessão são entregues uma vez e somente seu digest é persistido;
- APIs públicas usam DTOs allowlist;
- respostas privadas da API desabilitam cache;
- dados privados não podem entrar em HTML público, metadados, sitemap, robots, logs ou payloads anônimos;
- conteúdo do GitHub será tratado como dado não confiável.

Consulte `SECURITY.md` e `PUBLIC_SITE.md` antes de alterar rotas ou serializadores públicos.

## Estado atual

Implementado na fundação:

- workspace TypeScript estrito;
- guardrails de upstream, confidencialidade e fronteiras;
- invariantes de etapa;
- contratos públicos e privados;
- schema relacional e seed demonstrativo explícito;
- autenticação local revogável, composição Node/SQLite e controles HTTP;
- API pública/privada inicial;
- sistema de design e menu móvel funcional;
- rotas públicas estruturais;
- login e rotas privadas protegidas;
- serviços de Overview, Hoje, Projetos e Roadmap.

Ainda não concluído:

- instalação e build integral em ambiente com registry completo;
- lockfile gerado pelo primeiro install válido;
- adaptador de produção para o host escolhido;
- migração Notion;
- sincronização GitHub;
- MCP;
- escrita operacional e auditoria de mutações;
- conteúdo editorial aprovado;
- deploy.

## Referência upstream

A fundação avaliou seletivamente `krisnarane/pdi-template` no commit registrado em `docs/UPSTREAM_REFERENCE.md`. Consulte também `THIRD_PARTY_NOTICES.md`. Nenhum conteúdo, dado pessoal, taxonomia de PDI ou identidade visual literal deve ser introduzido.
