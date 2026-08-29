# Estado de desenvolvimento — 2026-08-29

Este documento é um mapa de continuidade do **Semogtw Site / DevOS**. O repositório possui mais de uma linha aberta e algumas delas são **PRs empilhadas**, portanto não existe uma única branch que possa ser chamada de “a branch ativa” sem contexto.

A `main` continua sendo a fonte de verdade do que está integrado. Features em PR só passam a fazer parte do produto integrado depois de merge explícito.

## Visão geral do produto

O repositório reúne duas superfícies relacionadas, mas com públicos diferentes:

1. **Portfólio público:** projetos, habilidades demonstradas por trabalho real, formação, certificados, notas e trajetória.
2. **Semogtw DevOS privado:** infraestrutura pessoal para organizar desenvolvimento, workflows, evidências, conteúdo, aprendizado e automações.

A arquitetura precisa preservar essa separação: uma feature útil no DevOS não deve vazar conteúdo, metadata ou operações privadas para o portfólio público.

## Linhas de desenvolvimento observadas

### Portfólio público

O README da `main` aponta `develop/public-portfolio-v1` como linha de trabalho para fortalecer a experiência pública antes de integração.

Antes de retomar essa branch:

- confirmar que ela ainda existe e continua à frente/compatível com `main`;
- comparar commits recentes;
- verificar se há PR correspondente ou se o trabalho foi parcialmente integrado por outro caminho;
- não assumir que o texto do README é um pointer temporal perfeito.

Objetivos persistentes dessa linha:

- case studies mais fortes;
- projetos apresentados com problema, decisões, arquitetura, trade-offs e aprendizado;
- credenciais/status claramente identificados;
- visual público refinado;
- evitar barras de proficiência e listas soltas de tecnologias sem evidência.

### Growth / aprendizado — PR #24

Branch: `develop/learning-growth-core-implementation`.

A PR #24 implementa núcleo de aprendizado/crescimento privado.

Escopo registrado:

- metas;
- checkpoints;
- skills;
- progresso derivado;
- optimistic concurrency;
- idempotência;
- repositories SQLite;
- read model owner-scoped;
- backup/restore;
- `/devos/growth` e detalhe de meta;
- redistribuição de pesos `automatic`/`custom`;
- preview server-side e atualização atômica.

A PR permanece draft e a evidência histórica registra que gates completos do head exato precisavam ser reexecutados em ambiente compatível.

### Command Gateway — PR #26

Branch: `develop/command-gateway-foundation-implementation`.

Baseada sobre a linha de Growth.

Escopo:

- pacote `@semogtw/application`;
- command envelope;
- registry versionado;
- resource bindings canônicos;
- canonical JSON/hash/timestamps;
- policy owner-browser deny-by-default;
- durable receipts;
- semantic idempotency;
- lease recovery;
- execução SQLite transacional;
- piloto `attention.transition`;
- `roadmap.stages.complete` registrado como high/blocked;
- editability coverage;
- owner-only discovery limitada a metadata humana.

A PR #26 registra evidência observada para install frozen, checks, build e Playwright focado no head documentado por ela. Novas mudanças depois daquele checkpoint precisam de nova evidência.

### Agent Write Authorization — PR #27

Branch: `develop/agent-write-authorization-implementation`.

Empilhada sobre PR #26.

Escopo implementado no nível de foundation/policy:

- capabilities fechadas;
- OAuth write scope mapping futuro;
- resource selectors;
- effective grants por cláusulas atômicas;
- trust sessions bounded;
- confirmation challenges;
- write switches independentes;
- policy engine;
- validação owner-only de grant requests;
- guardrails que impedem persistence de autorização antes dos pré-requisitos OAuth.

### Importante: write remoto continua bloqueado

A PR #27 **não** habilita remote writes.

Continuam ausentes/bloqueados no estado documentado:

- migration OAuth `0014_mcp_oauth.sql`;
- package `@semogtw/mcp-auth`;
- authenticated remote MCP read acceptance;
- migration `0018_agent_authorization.sql` efetiva;
- OAuth-bound repositories;
- persisted grants/trust/challenges/switches;
- owner management UI;
- MCP filtered discovery;
- remote write scopes/tools;
- aceitação com cliente real.

Não confundir “policy foundation existe” com “agente remoto pode escrever”.

## Cadeia de dependências das PRs principais

A leitura correta da pilha é:

```text
main
  ↓
PR #24 — Growth core + owner experience
  ↓
PR #26 — Command Gateway + editability foundation
  ↓
PR #27 — Agent write authorization foundation
```

Isso significa que PR #27 não deve ser revisada como um diff isolado sem compreender #24 e #26.

Se a base de uma PR mudar, revalidar:

- migrations;
- package boundaries;
- policy assumptions;
- lockfile;
- testes;
- docs que citam SHA/base anterior.

## Planejamento MCP / editability

Há uma cadeia anterior de PRs de planejamento/especificação (#20–#23) que continua relevante como documentação, mas não deve ser confundida com implementação integrada.

### PR #20 — Remote MCP/Spark planning

Planeja:

- OAuth 2.1;
- PKCE S256;
- DCR/preregistration;
- migration `0014`;
- gestão/consentimento owner-only;
- `apps/mcp-http`;
- Streamable HTTP autenticado;
- acceptance com clientes reais/Spark quando disponível;
- tools read-only antes de qualquer write.

### PR #21 — Learning/evidence/credentials planning

Planeja:

- goals/checkpoints/skills;
- evidence candidates/claims;
- credentials/certificates;
- adapters GitHub/Gmail/Spark;
- owner review;
- auto-accept apenas por regras determinísticas estreitas.

### PR #22 — Unified editability + adaptive owner experience

Define princípios:

- uso direto completo sem IA;
- automação determinística separada de IA;
- UI e automação convergindo em comandos canônicos;
- risco graduado;
- approvals;
- kill switches;
- executor de desenvolvimento isolado separado de tools comuns.

### PR #23 — implementation plan stack

Transforma as specs em uma sequência planejada, incluindo:

- Growth;
- Command Gateway;
- authorization;
- approvals/change sets;
- domain rollouts;
- development requests;
- isolated executor;
- deployment/rollback.

Esses documentos são direção/planejamento. A presença deles não torna as fases posteriores implementadas.

## Princípios de editabilidade

A direção arquitetural do DevOS é que superfícies significativas possam ser administradas pelo proprietário e, quando autorizado, por automações/IA.

Isso **não** significa expor ferramentas genéricas.

Evitar:

- SQL genérico;
- shell genérico;
- filesystem genérico;
- Git genérico;
- HTTP arbitrário;
- client-selected principal;
- client-selected risk;
- client-selected approval.

Preferir:

- commands tipados;
- schemas estritos;
- resource selectors;
- capability específica;
- expected state/version;
- idempotency key;
- audit;
- approval server-owned quando necessário.

## Risk model

Preservar monotonicidade do risco:

- low: pode ser elegível a execução direta sob grant/switch válido;
- medium: exige confirmação conforme policy;
- high: prepara approval;
- critical: nunca deve virar execução direta por trust/client confirmation.

Trust sessions devem continuar limitadas e não podem ampliar capability/resource/risk além das cláusulas base.

## Growth

O progresso deve continuar **derivado e explicável**.

Não reintroduzir:

- porcentagem persistida como autoridade editável;
- setter direto de progresso;
- LLM definindo progresso canônico sem evidência/regras;
- client enviando pesos “já calculados” quando o servidor deve recalcular/validar.

Templates/defaults/redistribuição determinística devem funcionar sem modelo/API.

## Público × privado

Gates fundamentais:

- rotas DevOS owner-only;
- metadata privada não indexável/publicável por acidente;
- nenhum token/secret no bundle público;
- adapters externos não podem ampliar superfície pública;
- backup/export privado deve respeitar ownership;
- case studies públicos precisam usar conteúdo explicitamente público.

## CI e Toolchains

A base atual já utiliza `Semogtw/Offline-Toolchains` para parte de execução pesada/reprodutível.

Interpretar corretamente:

- Toolchains prepara/executa gates definidos;
- resultado precisa estar vinculado ao SHA/branch correto;
- run de infraestrutura não prova deploy;
- focused test não é full suite;
- ausência de ambiente deve ser documentada, mas não autoriza declarar PASS por inspeção estática.

## Gates recomendados por camada

### Application/domain

- unit tests;
- typecheck;
- boundary checks;
- canonical serialization/hash tests;
- policy/resource selector tests;
- corrupt/invalid state tests.

### Database

- migrations em ordem real;
- rollback/failure behavior;
- receipts/idempotency;
- backup/restore;
- foreign keys/prerequisite guards;
- tampered-state cases.

### Web

- owner isolation;
- CSRF;
- forms/commands;
- discovery sem leakage técnico desnecessário;
- accessibility;
- mobile/desktop;
- Playwright focado e, antes de merge, cobertura adequada do fluxo completo.

### MCP futuro

- OAuth/protocol conformance;
- token lifecycle/revocation;
- scopes;
- filtered discovery;
- principal binding;
- read-only acceptance antes de writes;
- real client acceptance;
- kill switches;
- no self-escalation.

## Estado de evidência

Não existe uma certificação global única das PRs abertas.

Regras:

- use a evidência registrada na PR/doc do SHA correspondente;
- se houve commit posterior, reexecute o gate relevante;
- PR #26 possui gates observados no checkpoint documentado;
- PR #27 declara explicitamente que os novos gates da branch ainda não haviam sido executados no ambiente daquela sessão;
- PR #24 também requer reconciliação/reexecução conforme o head atual.

## Estratégia de integração recomendada

Não fazer merge da pilha “de cima para baixo” apenas porque a última PR parece mais completa.

Ordem mais segura:

1. atualizar/reconciliar PR #24 com `main` atual;
2. executar gates e revisar migrations;
3. integrar #24 se aprovada;
4. rebase/retarget/reconciliar #26 sobre base integrada;
5. gates completos de #26;
6. integrar #26 se aprovada;
7. reconciliar #27;
8. somente depois criar persistence/OAuth/write adapters que dependam da foundation.

Se for escolhida estratégia diferente, documentar claramente o porquê e evitar duplicar migrations durante conflito.

## Portfólio público — direção

A parte pública deve continuar priorizando apresentação real de trabalho:

- problema;
- contexto;
- decisões;
- arquitetura;
- trade-offs;
- resultados verificáveis;
- aprendizado.

Evitar:

- “skill bars” arbitrárias;
- listas enormes de badges;
- tecnologias apresentadas como domínio apenas porque aparecem em projeto agent-driven;
- texto genérico de portfólio sem evidência.

## Próximos passos recomendados

### Curto prazo

1. confirmar estado real de `develop/public-portfolio-v1`;
2. reconciliar quais PRs da pilha DevOS continuam pretendidas para merge;
3. atualizar bases das PRs antigas contra `main` atual;
4. executar gates faltantes em #24/#27;
5. evitar iniciar persistence/write remoto antes dos pré-requisitos OAuth/read-only.

### Depois

6. fechar remote MCP read-only com cliente real;
7. implementar persistence de authorization somente depois do hard gate OAuth;
8. adicionar approvals/change sets;
9. fazer rollout de writes por domínio, não um tool genérico universal;
10. manter executor de desenvolvimento isolado e separado de operações de produto comuns.

## Definition of Done por PR

Uma PR da pilha DevOS só deve ser considerada pronta quando:

- base está atual e coerente;
- migrations não colidem;
- lockfile está reconciliado;
- unit/typecheck/check/build relevantes passam no head exato;
- E2E focado cobre o comportamento novo quando aplicável;
- segurança/owner isolation permanecem fechadas;
- documentação distingue implementado de planejado;
- não há claim de MCP/write/deploy que dependa de infraestrutura ausente;
- merge é autorizado separadamente.

## Fontes de verdade

- `README.md` — apresentação do projeto;
- `AGENTS.md` — instruções de trabalho;
- `SECURITY.md` — segurança;
- `DATA_MODEL.md` — modelo de dados;
- `MCP.md` — estado/contratos MCP;
- `docs/architecture/EDITABILITY_COVERAGE.md` — cobertura de editabilidade;
- `docs/superpowers/specs/` — designs;
- `docs/superpowers/plans/` — planos;
- `docs/testing/` e `docs/verification/` — evidência por checkpoint;
- PRs #20–#27 — escopo e estado das linhas ainda não integradas.

Este arquivo é um mapa de coordenação. Ele não torna uma PR parte de `main` e não substitui a evidência do SHA exato.