# Estado de desenvolvimento do SemogSite

**Atualizado:** 8 de outubro de 2026  
**Branch oficial de trabalho:** `develop/site`  
**Branch de integração/estável do repositório:** `main` (sem merge automático).

## Produto vigente

O projeto oferece duas experiências:

1. **Portfólio público:** Home, projetos/case studies, habilidades, formação e
   certificados, Sobre, Contato, Trajetória, Notas e SEO/discovery.
2. **Administração privada:** login owner-only, rascunhos e revisões de conteúdo,
   aprovação, publicação, retirada, rollback, aliases e auditoria.

A antiga proposta de DevOS como central de monitoramento e orquestração de
projetos de IA foi descontinuada. Runs, agentes, roadmaps, reservas,
checkpoints, handoffs e sincronização de GitHub não são features do produto.

## O que existe no código da branch oficial

- Estrutura visual responsiva do portfólio e sistema de navegação.
- Case studies editoriais revisados e publicados aparecem no catálogo público,
  com estado vazio quando não há conteúdo aprovado.
- Formações/certificados modelados com estados honestos.
- Head, canonical, sitemap, robots, Open Graph e metadata pública.
- CMS privado de documentos com revisões imutáveis e mudanças auditadas.
- Auth/session, CSRF, proteção same-origin, no-store e public DTO allowlist.
- API Hono pública e API privada reduzida a auditoria, discovery de
  capacidades editoriais e redirects.
- SQLite local e D1 para os adapters existentes. Migrations históricas
  permanecem para compatibilidade e preservação dos dados.

Rotas de acompanhamento de execuções/agentes e APIs correspondentes foram
removidas/desmontadas. O código histórico de domain/database/MCP não usado
pelo produto ainda demanda limpeza e reconciliação final de workspace. Ele
não deve voltar ao router/API durante essa limpeza.

## Importante: estado de deploy

**Não há produção validada.** O Worker D1 possui leitura pública, autenticação
e operações administrativas limitadas, mas o CMS de revisões e publicação ainda
utiliza server functions Node/SQLite. Portanto não existe paridade de escrita
editorial no deployment Cloudflare totalmente unificado.

É necessário escolher e implementar o caminho de hospedagem do CMS, testar o
fluxo real e validar backup, restore, cookies, CSRF e rollback. Não habilitar
deploy público nem dizer que o admin D1 está pronto antes dessa prova.

## Principais lacunas

1. Conteúdo real de 3–5 projetos representativos; publicar case studies.
2. Certificados concluídos genuínos e verificáveis.
3. Imagens reais de projetos, links e ajuste visual com conteúdo preenchido.
4. Validar no HEAD de `develop/site` unit tests, typecheck, build e Playwright.
5. Concluir a arquitetura de hospedagem do CMS (Node ou Worker-safe D1)
   e o preview privado seguro.
6. Desacoplar e eliminar arquivos/packages legados de orquestração sem perder
   dados existentes ou quebrar backups/migrations.
7. Revisar SEO, domínio/canonical, preview social e readiness de produção.

Uma API para agentes editarem rascunhos pode ser adicionada futuramente, apenas
com scopes editoriais, autenticação própria, auditoria, revisão owner-only e
sem ferramentas genéricas de Git, shell, servidor ou deployment.
**Esta API remota ainda não existe.**

## Evidência

Checkpoints passados em `develop/public-portfolio-v1` são históricos.
Nenhum `pnpm check`, build ou E2E foi executado no SHA atual de
`develop/site` através desta conexão. É necessário registrar um novo
checkpoint antes do merge ou deploy.

## Branches anteriores

- `develop/public-portfolio-v1`: base de UI pública incorporada.
- `main`: linha estável e integrações Cloudflare/D1 anteriores que já
  estavam contidas na base de portfólio; atualizações documentais pontuais
  devem ser reconciliadas sem restaurar a central operacional.
- `develop/learning-growth-core-implementation`: não integrar Growth,
  pois está fora do escopo atual.
- `develop/command-gateway-foundation-implementation`: não integrar
  gateway genérico; CMS atual possui seus próprios comandos editoriais.
- `develop/agent-write-authorization-implementation`: não integrar o
  control plane de agentes; uma eventual API editorial terá especificação
  mínima independente.
- `refactor/devos-editorial-admin-2026-10-08`: checkpoint inicial da
  simplificação; continuado em `develop/site`.

## Comandos de verificação recomendados

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check:site-admin-surface
pnpm check
pnpm build
pnpm test:e2e
```

Checkpoints de migrations, backup/restore e Cloudflare preview são separados.
Não eliminar tabelas históricas automaticamente ao eliminar a interface.
