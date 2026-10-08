# Simplificação do DevOS para administração do site

**Direção vigente desde 08/10/2026.** `develop/site` é a única linha
recomendada para novas features do portfólio e sua área privada.

## Decisões confirmadas

- O DevOS deixa de ser um control plane de execução/monitoramento de IA.
- Mantemos CMS, login, edições, revisões, publicação, redirects e auditoria.
- Publicação pública sempre deriva exclusivamente de revisão aprovada.
- O painel é funcional sem agente ou serviço de IA.
- No máximo, futuramente existirá uma API de agentes com capacidade editorial
  explícita. Nenhuma interface de execução remota ou WebSocket é necessária.
- Não fazemos merge em bloco de Growth, Command Gateway ou Agent Write
  Authorization; isso restauraria um produto que não queremos.

## Implementação na nova linha

- `/devos`: início administrativo, sem métricas de projetos ou agentes.
- Sidebar e navegação mobile: Início, Conteúdo, Auditoria, Ajustes e Site.
- Rotas privadas operacionais de runs, workflows, GitHub, Today, Roadmap,
  Recovery, Projects/Operations/Capture removidas do router.
- API Hono privada expõe só `audit`, `capabilities` (metadados
  de duas operações editoriais) e `editorial-redirects`.
- `privateStateWriteCapabilities`: apenas criar/revogar redirect.
- Composições Node e D1 deixam de instanciar serviços operacionais.
- Client do navegador expõe somente leitura administrativa e comandos de
  redirects; bloqueia operações operacionais localmente.
- Componentes e handlers web/api operacionais não usados foram retirados.
- Portfólio público, editor editorial, auth, SEO e fluxo de revisão preservados.

## Fora de escopo e ainda pendente

A infraestrutura histórica de persistência, domínio e MCP permanece
parcialmente no repositório. Isso **não** significa que há um transporte MCP
habilitado ou API de execução ativa: tais endpoints foram desmontados.

Limpeza definitiva desses packages, migrations e dependências requer:
1. grafo real de imports/exports e conformidade do workspace;
2. congelamento/backup dos dados antigos e restore testado;
3. remoção de módulos órfãos, seus testes e scripts de guardrail específicos
   sem enfraquecer segurança ou checks do CMS;
4. atualização do lockfile e testes completos no SHA exato.

**Não apagar tabelas antigas** em migração sem plano explícito de backup,
retenção e compatibilidade. Preferir deixar tabelas históricas inertes
a introduzir uma operação destrutiva sem restore comprovado.

## API futura para agentes (não implementada)

Pode ter comandos tipados de `content.read`, `content.draft.create`,
`content.revision.propose` e `content.submit_for_review`. Exigir scopes
limitados, allowlist por documento, token revogável, rate limit, idempotência,
auditoria e isolamento de principal. Não permitir publicação/retirada sem
confirmação do proprietário, nem SQL/shell/Git arbitrários.
O catálogo atual usado pelo navegador não autentica agentes remotos.

## Limitação crítica de hospedagem

O CMS privado preservado é baseado em server functions Node/SQLite, enquanto
o adapter D1 atual cobre apenas a superfície API reduzida. Para um
`develop/site` plenamente pronto para produção Cloudflare, ainda falta
resolver esse backend editorial e provar o fluxo real de publicação.

## Aceitação

- `pnpm check:site-admin-surface`, `pnpm check` e `pnpm build` verdes;
- autenticação e CSRF owner-only;
- E2E de rascunho -> revisão -> publicação -> alteração -> rollback/retirada;
- GET autenticado a endpoints retirados deve retornar 404;
- POST autenticado a comandos retirados não pode executar mutação;
- versão pública nunca revela drafts nem metadados privados;
- mobile 360px, desktop, SEO e bundle checks;
- backup, restore e rollback validados antes do primeiro deploy.

**Sem testes automatizados no HEAD desta conexão**; as mudanças foram
persistidas no GitHub e inspecionadas estaticamente. Não declarar verificação
completa nem release.
