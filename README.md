# Semogtw Site

Site pessoal e portfólio técnico da **Semogtw**, com foco em apresentar projetos, habilidades, formação, certificados, trajetória e conteúdo técnico por meio de evidências reais de trabalho.

A plataforma também contém o **Semogtw DevOS**, uma área privada para operação e desenvolvimento, mas a prioridade atual do produto é a experiência pública. Novas capacidades privadas ficam abaixo da fila enquanto não forem necessárias para publicar o portfólio, corrigir regressões ou proteger segurança/privacidade.

## Prioridade atual: portfólio público

A linha de desenvolvimento pública está em `develop/public-portfolio-v1`.

Antes do refresh documental de 25 de agosto de 2026, essa branch estava em `adaa00fd182fea4776f424fc6b42dde152bde891`, **162 commits à frente de `main` e 0 atrás**. Portanto, `main` ainda não representa o estado atual da experiência pública.

A arquitetura pública principal é:

```text
/             Home do portfólio
/projects     Projetos e case studies
/stack        Habilidades ligadas a evidências
/credentials  Formação e certificados
/about        Perfil profissional
/contact      Canais públicos de contato

/notes        Notas técnicas públicas (complementar)
/journey      Trajetória (complementar)
/lab          Laboratório secundário, não promovido na V1
```

### O que já está feito

- Home profissional orientada a projetos e evidências;
- navegação pública desktop/mobile e estados acessíveis;
- página de Projetos e detalhe em formato de case study;
- fluxo editorial privado → revisão → publicação para Projetos e Notas;
- página de Habilidades sem barras arbitrárias de proficiência;
- página de Formação/Certificados com modelo tipado e estados explícitos;
- Sobre, Contato e Trajetória;
- índice/detalhe de Notas;
- shell visual público separado do DevOS;
- canonical, Open Graph, Twitter metadata e JSON-LD factual;
- `robots.txt` e `sitemap.xml` dinâmicos, respeitando estado real de publicação;
- testes de navegação pública, 360 px, teclado, auth topology, privacidade e publicação editorial;
- fronteira explícita que impede contexto operacional privado de virar conteúdo público automaticamente.

### Próximos passos

A maior lacuna atual é **conteúdo público forte**, não mais infraestrutura básica.

Ordem recomendada:

1. publicar os primeiros **3–5 case studies reais**;
2. consolidar certificados concluídos com emissor, data e URL verificável quando existirem;
3. ligar Home e Habilidades aos projetos que realmente provam cada competência;
4. fazer o polimento visual usando conteúdo real, não placeholders;
5. adicionar screenshots/diagramas/capas somente quando aumentarem compreensão;
6. finalizar origin público, imagem social e metadata de compartilhamento;
7. executar gates completos no head exato via `Semogtw/Offline-Toolchains`;
8. preparar integração da linha pública quando conteúdo e verificação estiverem adequados.

Regra de prioridade enquanto o portfólio for a principal lacuna:

```text
conteúdo/evidência pública
> clareza e UX do portfólio
> acessibilidade/SEO/performance pública
> infraestrutura necessária para publicar
> manutenção do DevOS
> novas capacidades privadas
```

## Documentação principal

Para o trabalho atual do site, comece por:

- [Estado atual do site](docs/SITE_STATUS.md) — inventário de superfícies, componentes, lacunas, prioridades e sequência recomendada;
- [Public Portfolio V1](docs/PUBLIC_PORTFOLIO.md) — contrato de produto, arquitetura pública, fronteira editorial e critérios de verificação;
- [Template de case study](docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md) — estrutura para transformar projetos em material de portfólio;
- [Deployment](DEPLOYMENT.md) — modos, gates, rollback e requisitos de produção.

Documentação técnica complementar:

- [Workflow orchestration core](docs/WORKFLOW_ORCHESTRATION.md) — reservas, gates, recuperação, fila segura, privacidade e evidências;
- [Fundação Cloudflare Worker + D1](docs/deployment/2026-08-05-cloudflare-d1-foundation.md) — composição Worker/D1, auth, leituras privadas e bloqueios de promoção;
- [Tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md) — instalação/checkouts/gates reproduzíveis sem depender do ambiente local;
- [Arquitetura e fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md) — fronteiras e decisões estruturais;
- [Modelo de dados](docs/DATA_MODEL.md) — entidades, projeções, aliases e migrations;
- [Segurança](docs/security/README.md) — autenticação, privacidade, integrações e threat models;
- [Testes](docs/TESTING.md) — gates gerais e evidências observadas.

## Stack

O stack principal usa:

- TypeScript;
- React;
- TanStack Start / Router;
- Hono;
- Zod;
- Drizzle ORM;
- SQLite / Cloudflare D1;
- pnpm workspaces;
- Playwright e Vitest;
- Cloudflare Workers como direção de hospedagem da plataforma.

## Estrutura do repositório

```text
apps/web               TanStack Start: site público e DevOS
apps/api               Hono: API runtime-neutral, Node/SQLite e Worker/D1
apps/mcp               composição SQLite → DevOSReadService → McpServer
packages/domain        regras e serviços sem framework
packages/contracts     schemas e DTOs públicos/privados
packages/database      Drizzle, SQLite/D1, migrations, writes e read models
packages/github        cliente REST GET-only e fonte de observações
packages/mcp           adapter MCP somente leitura, sem transporte remoto
packages/auth          autenticação local, cookies, CSRF e sessões revogáveis
packages/ui            tokens, primitivas e navegação
packages/config        configuração tipada e fail-closed
```

## Como a área pública funciona

### Conteúdo estático deliberadamente público

Perfil, textos institucionais e conteúdo profissional simples podem ser commitados diretamente quando forem claramente públicos e não inferirem dados privados.

### Projetos e Notas

Conteúdo editorial dinâmico segue a fronteira:

```text
rascunho privado
→ revisão
→ aprovação
→ publicação
→ projeção pública
```

Rascunhos, sessões, branches, runs, blockers, recomendações, reservas e outros dados operacionais não entram automaticamente no site público.

O preset de case study dentro do editor privado apenas prepara um rascunho estruturado; ele não aprova nem publica nada.

## Estado das superfícies públicas

| Superfície | Estrutura | Conteúdo | Prioridade |
| --- | --- | --- | --- |
| Home | pronta | parcial | refinar após case studies |
| Projetos | pronta | precisa de cases fortes | **P0** |
| Habilidades | pronta | utilizável | P1, integrar evidências |
| Certificados | pronta | formação ativa presente; catálogo concluído incompleto | **P0** |
| Sobre | pronta | utilizável | baixa |
| Contato | pronta | utilizável | baixa |
| Trajetória | pronta | utilizável | baixa |
| Notas | pronta | depende de publicação editorial | P2 |
| Lab | rota existe | função ainda fraca | P2 |
| SEO/discovery | fundação pronta | origin/assets finais pendentes | P1 |
| DevOS | subsistema privado maduro | não é proposta de valor pública | manutenção |

Detalhes e arquivos correspondentes estão em [`docs/SITE_STATUS.md`](docs/SITE_STATUS.md).

## Formação pública modelada atualmente

O código público registra como **em andamento**:

- Ciência da Computação — UESB;
- Trilha de Analista de Dados — DataCamp.

Certificados concluídos não devem ser inventados para preencher a página. Só entram com dados exatos e deliberadamente públicos.

## Desenvolvimento local

### Requisitos

- Node.js 22;
- pnpm 10.14;
- binário/toolchain compatível com `better-sqlite3` para Node/SQLite;
- HTTPS ao GitHub apenas quando observações reais forem executadas.

Em ambientes sem acesso direto ao npm, use os artifacts reproduzíveis de [`Semogtw/Offline-Toolchains`](https://github.com/Semogtw/Offline-Toolchains) e siga [`docs/OFFLINE_TOOLCHAIN.md`](docs/OFFLINE_TOOLCHAIN.md).

Gates pesados, Actions e fluxos que exijam checkout privado devem ser centralizados no repositório público de toolchains quando possível.

### Instalação

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm hash:owner-password
```

Copie o hash gerado para `SEMOGTW_OWNER_PASSWORD_HASH` e configure `SEMOGTW_SESSION_SECRET` com pelo menos 32 caracteres.

Para observações GitHub, `SEMOGTW_GITHUB_TOKEN` é opcional e deve existir somente no servidor, com permissões fine-grained mínimas e restritas aos repositórios necessários.

### Executar

```bash
pnpm dev       # web
pnpm dev:api   # Hono/Node em http://localhost:3001
pnpm dev:all   # ambos
```

Sem autenticação válida, `/devos` e `/api/v1/private/*` falham fechados.

## API e hospedagem

A direção de hospedagem escolhida é Cloudflare Workers + D1, mantendo Node/SQLite como referência local e para superfícies ainda não portadas.

Rotas públicas centrais:

```text
GET /health
GET /ready
GET /api/v1/public/projects
GET /api/v1/public/projects/:slug
```

Rotas auth/private também fazem parte da plataforma, mas sua portabilidade não deve bloquear trabalho público que possa avançar independentemente.

O Worker Cloudflare usa `apps/api/src/worker.ts` e `apps/api/src/composition/d1.ts`. Não existe autorização implícita para deploy de produção.

Ainda não há paridade Worker/D1 para todas as mutações privadas do DevOS. A implantação final deve respeitar essa diferença até a portabilidade ser concluída e verificada.

## Semogtw DevOS

O DevOS continua sendo uma área privada relevante para operação do projeto. Entre as superfícies implementadas estão:

- Overview e Hoje;
- Projetos e Roadmap;
- captura e ciclo de atenção;
- sessões/handoffs/evidências;
- Auditoria;
- Operação GitHub somente leitura;
- ledger de execuções cooperativas;
- reservas de escopo, gates e recuperação;
- ciclo editorial owner-only com revisão, aprovação, publicação, retirada e rollback.

Essas capacidades permanecem preservadas, mas o roadmap atual não deve adicionar features privadas sem relação com a entrega pública enquanto o portfólio ainda tiver lacunas P0/P1.

## MCP

`apps/mcp` compõe um servidor MCP interno somente leitura sobre serviços do DevOS.

Ele **não possui transporte remoto** nesta fase. Qualquer exposição futura exigirá autenticação, autorização, isolamento de sessão, TLS, validação de Host/Origin, rate limiting, timeouts, cache privado, logging sanitizado, revogação e rollback.

MCP remoto não é prioridade do portfólio público atual.

## Segurança e privacidade

Princípios que não podem ser enfraquecidos pelo trabalho de portfólio:

- autenticação e mutações privadas fail-closed;
- sessões persistidas somente por digest;
- CSRF, confirmação, versão esperada e auditoria em mutações sensíveis;
- rejeição de origem/fetch metadata incompatíveis;
- respostas públicas baseadas em DTOs allowlist;
- conteúdo editorial público somente após aprovação/publicação;
- branches, runs, reservas, gates, snapshots, payloads MCP e contexto owner-only permanecem privados;
- nenhum token ou authorization header é persistido como conteúdo;
- Worker não deve importar dependências Node/SQLite fora dos subpaths explicitamente permitidos.

## Gates

```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm check:cloudflare-worker-boundary
```

Para o portfólio, a verificação completa esperada inclui:

```text
frozen install
boundary/confidentiality checks
focused tests/typechecks
full pnpm check
production web build
Playwright auth/privacy/editorial/portfolio
```

O último checkpoint de portfólio explicitamente documentado como totalmente verde é `1d311da7c66c80dd0678b463342858dbb08c6980`, com 260 arquivos / 964 testes no workspace e E2E de auth, workflow privacy, editorial publication e public portfolio aprovados no hub público.

Commits posteriores a esse SHA devem ser tratados como **ainda não cobertos por aquela evidência** até nova execução no head exato.

Se um runner, quota, rede ou dependência externa impedir um gate, registre a limitação e continue tarefas resolvíveis por código/documentação em vez de tratar o bloqueio ambiental como fim da sessão.

## Backup e dados privados

O runtime Node/SQLite mantém utilitários de backup/validação:

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Export/restore de D1 remoto precisa ser provado separadamente antes de produção.

## Estado geral resumido

### Público

A infraestrutura da V1 está majoritariamente pronta. O trabalho de maior impacto agora é transformar projetos e formação reais em um portfólio convincente e então fazer o polimento visual/SEO sobre esse conteúdo.

### Privado

O DevOS possui uma base muito mais madura que a parte pública e, por isso, deixa de ser o foco de expansão no ciclo atual.

### Deployment

Cloudflare Workers + D1 continua sendo a direção escolhida, mas origin definitivo, assets sociais, promoção e alguns aspectos privados ainda exigem validação antes de produção.

## Referência upstream

A fundação avaliou seletivamente o upstream registrado em `docs/UPSTREAM_REFERENCE.md`. Conteúdo pessoal, taxonomia de PDI e identidade visual literal do projeto de referência não devem ser reintroduzidos.
