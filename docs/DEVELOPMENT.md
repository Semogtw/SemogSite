# Guia de desenvolvimento — SemogSite

## Branch canônica

`develop/site` é o **único ponto de partida recomendado** para mudanças
funcionais, documentação vigente e review do produto. `main` permanece a
base integrada/estável do GitHub; modificar a branch padrão no GitHub não
faz parte desta consolidação. Não criar features sobre branches históricas.

Nova contribuição: branch curta criada a partir de `develop/site`, PR de
retorno para `develop/site`, testes no SHA exato e merge após revisão.
Para publicar em `main`, reconciliação independente com CI completo.

## Escopo do produto

- Portfólio público: Home, case studies, Habilidades, Formação/Certificados,
  Sobre, Contato, Trajetória, Notas, SEO e acessibilidade.
- Admin privado: conteúdo, revisões, workflow editorial, redirects,
  autenticação, segurança e auditoria.
- API pública aprovada e API privada mínima para o admin.
- Agentes externos **não têm** endpoint de edição ou execução hoje.
  Uma futura API deve limitar-se à proposta de revisões editoriais.

Não implementar: monitoramento de agentes/projetos GitHub, orquestração,
WebSocket para acompanhamento de sessões, filas de comandos de desenvolvimento,
reserva de escopo, lifecycle/roadmaps de builds, Growth ou control plane de deploy.

## Como consolidamos as branches

| Origem | Decisão |
| --- | --- |
| `develop/public-portfolio-v1` | incorporada como base funcional do front público |
| `main` | adaptações D1/Cloudflare já herdadas da base pública; alterações documentais mais novas não justificam merge da antiga infraestrutura |
| `develop/editorial-workspace` | fluxo editorial já estava incorporado à base pública |
| `develop/learning-growth-core-implementation` | não incorporar: produto fora de escopo |
| `develop/command-gateway-foundation-implementation` | não incorporar: gateway para operações de desenvolvimento não é necessário |
| `develop/agent-write-authorization-implementation` | não incorporar: OAuth/grants genéricos para agentes ainda não fazem parte do CMS |
| `refactor/devos-editorial-admin-2026-10-08` | checkpoint que originou a linha oficial |

## O que não deve quebrar

Conteúdo privado não aparece em public loaders, URLs não publicadas não
vazam em SEO, auth e CSRF falham fechado, publicação só depois de aprovação
owner-only, redirects e histórico preservam idempotência, no-store e auditoria.

Nunca apagar tabelas antigas sem backup + restore validado. Tabelas
históricas podem permanecer inertes durante a transição. O código
órfão de domínio/database/MCP ainda não foi inteiramente removido do
workspace. Sua limpeza deve ser uma mudança isolada com verificação total.

## Desenvolvimento local

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev:all
pnpm check:site-admin-surface
pnpm check
pnpm build
pnpm test:e2e
```

Node 22 e pnpm 10.14. O uso completo do editor exige o runtime Node/SQLite,
enquanto o Worker D1 ainda não implementa toda a escrita editorial. Validar
esse ponto antes de definir o host de produção.

## Pendências para release

Case studies reais, credenciais verificáveis, mídia/UX, domínio/SEO,
alinhamento de storage público e publicação, Cloudflare preview/rollback,
backup/restore, testes de auth/editorial e verificação no commit exato.

**O código foi consolidado por alterações no GitHub, mas os gates da linha
nova ainda não foram executados nesta sessão.**
