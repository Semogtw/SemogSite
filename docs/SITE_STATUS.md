# Estado do site

> Atualizado em 25 de agosto de 2026. A prioridade de produto é a **parte pública do site**, tratada como portfólio profissional. O Semogtw DevOS continua preservado como área privada e infraestrutura de apoio, mas não deve competir por prioridade com a experiência pública salvo correções de regressão, segurança ou dependências necessárias à publicação.

## Branch de referência

A linha ativa para o site público é `develop/public-portfolio-v1`.

Antes deste refresh documental, ela estava no commit `adaa00fd182fea4776f424fc6b42dde152bde891`, **162 commits à frente de `main` e 0 atrás**. A `main` permanecia em `42adc1b578d33e272f55dff568acb9597221bae9`.

Isso significa que `main` não representa o estado atual do front público. Para analisar, testar ou continuar o portfólio, use `develop/public-portfolio-v1` até que essa linha seja integrada deliberadamente.

## Direção de produto

A superfície pública deve responder rapidamente:

1. quem é Semogtw;
2. o que sabe construir;
3. onde essas habilidades foram aplicadas;
4. quais projetos merecem inspeção aprofundada;
5. qual formação/certificados apoiam esse repertório;
6. como entrar em contato.

O site público não deve parecer documentação do próprio DevOS. Infraestrutura privada, workflows internos, branches, runs, reservas, gates e contexto operacional não são proposta de valor pública.

## Arquitetura pública atual

### Navegação principal

Rotas promovidas no cabeçalho:

- `/projects` — projetos e case studies;
- `/stack` — habilidades por evidência;
- `/credentials` — formação e certificados;
- `/about` — perfil profissional e forma de trabalhar;
- `/contact` — canais públicos de contato.

Rotas complementares promovidas no rodapé:

- `/notes` — notas públicas revisadas;
- `/journey` — trajetória.

Rotas existentes, mas não promovidas como parte principal da V1:

- `/lab` — laboratório ainda secundário e sem papel forte na arquitetura atual.

A Home permanece em `/` e funciona como síntese e porta de entrada.

## Componentes e superfícies implementados

### Shell público

**Estado: feito**

- header compartilhado;
- navegação desktop/mobile;
- estado ativo por rota com `aria-current`;
- fechamento do menu mobile por Escape e restauração de foco;
- skip link para o conteúdo principal;
- footer público com identidade, Notas e Trajetória;
- separação visual e estrutural do DevOS.

Arquivo principal: `apps/web/src/components/public/public-shell.tsx`.

### Home `/`

**Estado: feito estruturalmente; conteúdo real ainda pode crescer**

- hero orientado a portfólio técnico;
- CTA para Projetos e Habilidades;
- quatro blocos de capacidades demonstradas;
- seção de projetos selecionados baseada na projeção publicada;
- empty state honesto quando não houver case studies publicados;
- preview de Formação/Certificados;
- CTA de contato;
- metadata própria e JSON-LD factual.

Arquivo: `apps/web/src/routes/index.tsx`.

### Projetos `/projects` e `/projects/:slug`

**Estado: infraestrutura e apresentação feitas; prioridade imediata é conteúdo real**

- listagem de case studies publicados;
- cards com título, resumo, tags e data;
- empty state sem projetos de exemplo falsos;
- detalhe em formato de case study;
- conteúdo público vindo apenas da projeção editorial aprovada/publicada;
- template privado de autoria para problema, papel, solução, decisões, trade-offs, verificação, resultado e links;
- sugestão determinística de slug no editor privado;
- aliases/redirects e regras de publicação preservados.

Arquivos centrais:

- `apps/web/src/routes/projects.index.tsx`;
- `apps/web/src/routes/projects.$slug.tsx`;
- `apps/web/src/server/public-projects.server.ts`;
- `docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md`.

### Habilidades `/stack`

**Estado: feito para V1**

A apresentação evita barras de porcentagem e organiza habilidades pelo contexto em que foram usadas.

Grupos atuais:

- Frontend e produto;
- Backend e APIs;
- Dados e persistência;
- Automação e engenharia de software.

Evidências atuais apontam principalmente para SemogSite e Offline-Toolchains. O próximo ganho de qualidade virá ao ligar essas áreas a case studies específicos conforme eles forem publicados.

Arquivo: `apps/web/src/routes/stack.tsx`.

### Formação e certificados `/credentials`

**Estado: componente e modelo feitos; catálogo ainda precisa ser enriquecido com dados públicos reais**

- modelo tipado de credenciais;
- separação entre `in_progress` e `completed`;
- tipos acadêmico, trilha profissional, curso e certificação;
- instituição, descrição, habilidades relacionadas, data e URL de verificação opcionais;
- empty state explícito para certificados ainda não publicados;
- formação em andamento nunca é apresentada como certificação concluída.

Conteúdo público atualmente modelado no código:

- Ciência da Computação — UESB — em andamento;
- Trilha de Analista de Dados — DataCamp — em andamento.

Arquivos:

- `apps/web/src/routes/credentials.tsx`;
- `apps/web/src/content/public-credentials.ts`.

### Sobre `/about`

**Estado: feito para V1**

O placeholder antigo foi substituído por perfil profissional conciso, contexto de aprendizado e forma de trabalhar. Deve continuar sendo revisado conforme o portfólio ganhar evidências mais fortes, sem virar uma biografia longa.

Arquivo: `apps/web/src/routes/about.tsx`.

### Contato `/contact`

**Estado: feito para V1**

A página usa apenas canais deliberadamente públicos e allowlisted. O GitHub é o canal público já previsto; novos canais só devem entrar com decisão explícita de exposição.

Arquivo: `apps/web/src/routes/contact.tsx`.

### Trajetória `/journey`

**Estado: feito como superfície complementar**

A página conecta formação e projetos como evolução contínua e reutiliza o mesmo modelo tipado de credenciais para evitar divergência de conteúdo.

Arquivo: `apps/web/src/routes/journey.tsx`.

### Notas `/notes` e `/notes/:slug`

**Estado: infraestrutura pública feita; depende de publicação editorial real**

- índice público;
- detalhe de nota;
- conteúdo somente a partir da projeção revisada/publicada;
- empty state para ausência de notas;
- índice fica `noindex` enquanto não possuir conteúdo publicado;
- notas publicadas entram na descoberta/sitemap de acordo com estado real de publicação.

Arquivos:

- `apps/web/src/routes/notes.index.tsx`;
- `apps/web/src/routes/notes.$slug.tsx`;
- `apps/web/src/server/public-editorial.server.ts`.

### Laboratório `/lab`

**Estado: secundário / não priorizado**

A rota continua existindo, mas não deve consumir esforço relevante enquanto Projetos, credenciais e apresentação pública principal ainda tiverem lacunas de conteúdo e refinamento.

## SEO, descoberta e compartilhamento

**Estado: fundação feita**

Já existem:

- canonical provider-neutral;
- Open Graph;
- Twitter metadata;
- metadata específica para páginas editoriais;
- JSON-LD factual na Home;
- `/robots.txt` dinâmico;
- `/sitemap.xml` dinâmico;
- exclusão de conteúdo privado, desconhecido, retirado ou não publicado;
- comportamento de indexação de Notas dependente do estado de publicação.

Ainda depende de decisão posterior:

- origin público definitivo;
- imagem/social preview deliberada;
- revisão final de crawler policy no ambiente realmente publicado.

## Segurança e fronteira público/privado

**Estado: preservado e obrigatório**

O portfolio não pode consumir automaticamente estado operacional privado para gerar conteúdo público.

Continuam privados, entre outros:

- branches e estado interno de repositórios;
- runs e sessões;
- reservas de escopo;
- gates, blockers e recuperação;
- recomendações internas;
- conteúdo editorial não aprovado;
- payloads MCP e contexto owner-only.

Projetos e notas dinâmicos só entram na superfície pública através da projeção editorial aprovada/publicada. O preset de case study cria rascunho privado e não publica automaticamente.

## Verificação existente

A branch ganhou cobertura específica para o portfólio:

- navegação pública;
- acessibilidade/teclado e viewport de 360 px;
- auth topology;
- privacidade de workflow;
- publicação editorial;
- metadata/discovery;
- helpers de slug e structured data;
- boundaries/confidencialidade.

O último checkpoint de portfólio explicitamente documentado como totalmente verde antes deste refresh é `1d311da7c66c80dd0678b463342858dbb08c6980`. Commits posteriores, incluindo o head de código analisado neste documento, devem ser considerados mais novos que essa evidência até nova verificação.

Gates pesados/checkouts devem continuar centralizados em `Semogtw/Offline-Toolchains` quando necessários.

## O que está bom o bastante para não ser prioridade agora

- estrutura principal de navegação pública;
- shell público responsivo;
- Home base;
- página de habilidades;
- página de formação/certificados e seu modelo;
- Sobre;
- Contato;
- Trajetória;
- infraestrutura de Projetos e Notas;
- SEO/discovery base;
- fronteira de publicação público/privado;
- base de testes do portfólio.

Essas áreas ainda podem receber refinamentos, mas não devem roubar prioridade dos maiores vazios de valor público.

## Lacunas atuais

### P0 — conteúdo público que prova trabalho

A maior lacuna não é infraestrutura: são **case studies reais e fortes**.

Priorizar:

1. selecionar os projetos que melhor representam competências diferentes;
2. escrever cada case study com problema, contexto, responsabilidade, solução, arquitetura, decisões, trade-offs, validação, resultado e aprendizados;
3. adicionar imagens/diagramas apenas quando explicarem algo relevante;
4. publicar pelo fluxo editorial existente;
5. ligar Habilidades e Home a essas evidências reais.

### P0 — credenciais reais

- inventariar certificados realmente concluídos;
- usar nome exato da credencial e emissor;
- adicionar data e URL verificável quando existirem;
- não criar certificado de exemplo;
- não promover curso em andamento como conclusão.

### P1 — polimento visual público

Depois de existir conteúdo suficiente para julgar a interface real:

- revisar hierarquia tipográfica;
- ritmo vertical e densidade;
- cards de projeto com mídia real;
- estados hover/focus;
- mobile 360 px e larguras intermediárias;
- reduced motion;
- consistência visual entre Home, Projetos, Habilidades e Credenciais;
- evitar regressões do DevOS sem dedicar redesign ao privado.

### P1 — apresentação dos projetos

- hero/capa por case study quando houver material adequado;
- galeria ou screenshots seletivos;
- diagramas de arquitetura quando melhorarem compreensão;
- links verificáveis para demo, código público, release ou documentação quando existirem;
- relações explícitas entre projeto, habilidades e formação.

### P1 — identidade e compartilhamento

- definir imagem social padrão;
- revisar favicon/ícones e identidade visual final;
- configurar origin público definitivo;
- revisar titles/descriptions com conteúdo real já publicado.

### P2 — Notas e Laboratório

Somente após a vitrine principal estar forte:

- publicar notas técnicas realmente úteis;
- decidir se `/lab` terá função clara ou se deve permanecer fora da navegação;
- evitar criar conteúdo apenas para preencher rotas.

### P2 — DevOS

Manutenção somente quando:

- houver regressão;
- existir risco de segurança/privacidade;
- uma capacidade privada for necessária para produzir/publicar o portfólio;
- um bloqueio impedir o fluxo editorial público.

Novas features privadas que não ajudam o site público ficam abaixo da fila atual.

## Próxima sequência recomendada

1. **Conteúdo:** escolher 3–5 projetos prioritários e preparar os primeiros case studies completos.
2. **Credenciais:** consolidar certificados concluídos e links verificáveis.
3. **Integração de evidências:** ligar Home/Habilidades aos projetos publicados.
4. **Polimento visual:** revisar o site já preenchido com conteúdo real, não placeholders.
5. **Mídia:** adicionar screenshots/diagramas/capas apenas onde aumentarem clareza.
6. **SEO final:** origin, social preview e revisão de metadata.
7. **Verificação:** executar gates completos no head exato via Offline-Toolchains.
8. **Integração:** preparar merge/PR da linha pública quando conteúdo e gates estiverem em estado adequado.

## Regra de priorização daqui para frente

Quando houver disputa entre duas tarefas, use esta ordem:

```text
conteúdo/evidência pública
> clareza e experiência do portfólio
> acessibilidade/SEO/performance pública
> infraestrutura necessária para publicar
> manutenção do DevOS
> novas capacidades privadas
```

Essa regra vale até a parte pública deixar de ser a principal lacuna do produto.
