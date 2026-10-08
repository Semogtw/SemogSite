# Simplificação do DevOS: administração editorial do SemogSite

**Decisão de produto (2026-10-08).** O portfólio público é o produto principal. A
área privada deve ser um painel de administração de conteúdo, não uma central
de controle para execução, acompanhamento ou orquestração de projetos de IA.

## Estado verificado e limite desta mudança

Base: `develop/public-portfolio-v1`, commit
`37109650acf8308dd3e23c80d3d756a87f612713`.

A página inicial, sidebar, navegação mobile e links editoriais foram
simplificados. Os endpoints privados de orquestração foram desmontados em
Node e D1. Permanecem endpoints privados de auditoria, capabilities editoriais
e redirects, protegidos por sessão, origem, CSRF e allowlist. O fluxo
editorial humano continua preservado.

**A migração do runtime está em andamento.** Os endpoints de orquestração
foram desmontados da API e as rotas operacionais foram removidas do router;
migrations e tabelas históricas continuam por compatibilidade e recuperação. Ocultá-los da navegação não significa que foram removidos ou
desabilitados. Nenhuma remoção do backend, migração destrutiva ou deploy é
declarada concluída por este commit. É necessário realizar as etapas seguintes
antes de afirmar que o control plane foi eliminado.

Na branch-base não há implementação de transporte WebSocket de controle; o
control plane implementado usa sobretudo HTTP, contratos de domínio,
persistência e rotas de operação.

## Escopo a preservar

- Portfólio público: Home, Projetos, Habilidades, Formação/Certificados,
  Sobre, Contato, Notas, SEO, sitemap, canonical, Open Graph, acessibilidade.
- CMS owner-only: criar rascunhos para projetos/notas/páginas/experimentos,
  editar revisões, visualizar prévias, aprovar/publicar/retirar, rollback,
  histórico editorial e redirects.
- Segurança: login/sessões, revogação, CSRF, same-origin, rate limit,
  auditoria editorial, projeções públicas allowlisted, noindex/no-store,
  backups/restauração e migrações aditivas.
- API pública de leitura de conteúdo aprovado; publicação nunca deve ler
  status de desenvolvimento privado como conteúdo editorial.

## Escopo a retirar

- Dashboards de GitHub e sincronização, recomendações de branch e targets
  de repositório.
- Monitoramento de runs/agentes, checkpoints, comandos em fila, handoffs,
  acompanhamento de sessões, recuperação e safe-work.
- Roadmaps/stages/attention/capture operacionais, verificação e reservas de
  escopo dedicadas à orquestração de desenvolvimento.
- Planejamentos de executores, WebSockets/event streams de orquestração e
  deployment control plane. Não introduzir transporte novo para esses usos.
- MCP read-only orientado a estado operacional do DevOS e PRs empilhadas de
  Growth/Command Gateway/Agent Write Authorization, salvo reavaliação
  separada do que for necessário para edição editorial.

## Etapas técnicas seguintes (ainda pendentes)

1. Levantar consumidores efetivos e contratos das rotas `/devos/*`,
   `/api/v1/private/*` e dos pacotes `domain`, `database`,
   `github`, `mcp`. Separar o que é exclusivamente operacional.
2. Criar uma matriz de preservação de dados. Fazer backup e restore de uma
   cópia e **não** dropar tabelas históricas em produção nesta limpeza.
3. Substituir/encerrar rotas UI operacionais: Today, Runs, Operations,
   Workflows, Recovery, Roadmap, project hubs, Capture e integrações
   operacionais, incluindo acessos por URL direta.
4. Desmontar registro de handlers privados operacionais no Hono, contratos
   de capabilities e composição Node/D1 associada. Não deixar endpoints
   ativos que a UI apenas esconde.
5. Remover importações, packages, repositórios e testes agora órfãos em
   commits pequenos, reconciliando `pnpm-lock.yaml`, `pnpm check`,
   `pnpm build`, migrations e guardrails.
6. Simplificar a nomenclatura e refinar UX do CMS, oferecendo controles
   pessoais de conteúdo, identidade pública e preferências do site.
7. Só então conciliar na linha pública final e validar em preview Cloudflare
   com auth/editorial/publicação e rollback.

## Possível API futura para agentes (não implementada)

Escopo máximo: `content.read`, `content.draft.create`,
`content.revision.propose`, `content.submit_for_review`, sujeito a
permissão granular e allowlist por tipo de documento. Publicação, remoção,
rollback, credenciais, acesso e gestão de agentes permanecem sob confirmação
do proprietário; preferir o fluxo editorial compartilhado à duplicação da
lógica por cliente externo.

Segurança mínima antes de expor: autenticação específica de cliente, tokens
revogáveis e com escopo, validação de schema e tipo de recurso, limite de
tamanho/rate limit, idempotência, CSRF/origin conforme modo de autenticação,
auditoria, revisão humana e desligamento independente. Nunca oferecer
SQL/shell/filesystem/Git/HTTP genéricos, monitoramento de jobs ou deploy.

API para agentes é opcional. O painel deve funcionar integralmente sem IA.

## Gates antes do merge

- `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`.
- Playwright: sessão anônima rejeitada, navegação desktop/360px, editor,
  publicação/retirada/rollback, público consumindo somente conteúdo aprovado.
- Busca de rotas e exports órfãos e testes negativos em URLs operacionais
  removidas (404/410, nunca vazamento ou fallback público).
- Compatibilidade de migrações, restore e rollback; não declarar prova sem
  execução no HEAD exato.
- Verificar conteúdo público, páginas de projetos, SEO e deploy preview.

**Testes não executados neste commit:** sessão de conexão GitHub sem checkout
local/Node/pnpm e sem DNS para baixar o repositório. Mudanças são estáticas e
precisam do CI apropriado antes de merge.
