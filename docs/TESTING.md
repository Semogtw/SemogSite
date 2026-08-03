# Testes e gates

A política do projeto é **evidência antes de declaração**. Código, migrations ou documentação não tornam uma fase aprovada até que os gates relevantes sejam executados no head correspondente.

## Preparação

```bash
corepack enable
pnpm install --frozen-lockfile
```

Em ambiente sem rede, siga `docs/OFFLINE_TOOLCHAIN.md`. O artifact offline deve fornecer Node, pnpm/store, a dependência nativa `better-sqlite3` e Chromium compatíveis com o lockfile.

O workflow focado adiciona `better-sqlite3` à allowlist somente no checkout efêmero do runner. A política de supply chain comprometida no repositório não é ampliada.

## Gate agregado

```bash
pnpm check
```

O comando executa:

- fixtures de guardrails;
- identidade upstream limpa;
- fronteiras do domínio;
- fronteiras de transporte, pacote e runtime MCP;
- guardrails do ledger cooperativo e editorial;
- scanner de confidencialidade pública;
- typecheck de todos os workspaces;
- Vitest de todo o monorepo.

Timeout ou handle órfão do harness não equivale a teste aprovado nem a regressão. Quando um ambiente realmente não consegue concluir a suíte agregada, os workspaces devem ser executados em lotes determinísticos e cada saída registrada. O CI atual conclui o agregado normalmente.

## Evidência observada do workflow core

Run `30841132598`, commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8`, em 3 de agosto de 2026:

| Gate | Resultado observado |
|---|---|
| instalação frozen + SQLite nativo | aprovado |
| fronteiras de pacotes | aprovado |
| confidencialidade pública | aprovado |
| domínio de orquestração | 7 arquivos, 34 testes aprovados |
| persistência focada | 10 arquivos, 33 testes aprovados |
| controles web focados | 2 arquivos, 8 testes aprovados |
| typecheck de domínio, banco, UI e web | aprovado |
| `pnpm check` completo | 151 arquivos, 576 testes aprovados |
| build cliente/SSR | aprovado |
| migrations no SSR | 13 arquivos |
| migrations no cliente | nenhuma |
| Playwright do workflow core | 6 de 6 aprovados |

Essa execução ocorreu antes dos commits finais de documentação. O merge exige uma nova execução integral no head documental final.

A matriz detalhada e as invariantes por módulo estão em `docs/testing/2026-08-03-workflow-orchestration-test-matrix.md`.

## Cobertura especializada do workflow core

### Domínio

- normalização e overlap de escopos;
- expiração derivada e estados persistidos;
- aquisição, renovação, release e override;
- idempotência e concorrência otimista;
- binding entre contexto e entidade antes do acesso ao repositório;
- gates ligados a SHA completo;
- classificação de falha/bloqueio;
- canonicalização, limites e rejeição de credenciais em snapshots;
- ranking e exclusões conservadoras de trabalho seguro.

### SQLite e backup

- migrations `0001`–`0013` em banco novo e de forma idempotente;
- constraints de reservas, obrigações e snapshots;
- atomicidade entidade/evento/auditoria;
- rollback quando evento ou audit falha;
- retries idempotentes e conflitos por intenção alterada;
- histórico imutável de recuperação;
- backup/restauração com integridade, foreign keys e conjunto exato de migrations.

### Web e servidor

- owner guard em leituras e mutações;
- CSRF e confirmação explícita;
- formulários somente para estados mutáveis;
- rota de recuperação como sibling route;
- capabilities vazias por padrão;
- reavaliação de capabilities somente na sessão;
- build das server functions e árvore TanStack.

### Browser

`tests/e2e/workflow-orchestration.spec.ts` observa:

1. redirect anônimo de `/devos/workflows` e `/devos/workflows/recovery` antes de conteúdo privado;
2. ausência de marcadores de workflow na home pública;
3. login owner e navegação entre dashboard e recuperação;
4. reavaliação de trabalho seguro com capabilities explicitamente digitadas;
5. ausência de overflow horizontal em 360 × 800 nas duas rotas;
6. cadastro de alvo privado, criação e override de reserva, criação de gate, resultado `blocked/environment_missing` e snapshot recusado sem observação GitHub.

O teste E2E usa banco isolado preparado por `scripts/prepare-e2e.mjs`. Nenhum repositório GitHub real é alterado.

## Gates editoriais

A matriz editorial permanece em `docs/testing/2026-08-01-editorial-test-matrix.md`. Ela cobre lifecycle, hash exato, concorrência, publicação, rollback, aliases append-only, redirect `308`, canonical/noindex, Markdown seguro e separação draft/público.

## Build

```bash
pnpm build
```

O build precisa confirmar:

- todos os workspaces relevantes;
- bundle cliente e SSR;
- 13 migrations somente no servidor;
- dependências nativas necessárias ao runtime Node;
- ausência de SQLite, migrations e secrets no bundle público.

O gate focado também executa:

```bash
pnpm --filter @semogtw/web build
```

seguido de `scripts/check-web-server-bundle.mjs`.

## Browser completo

```bash
pnpm test:e2e
```

Além do workflow core, a suíte versionada cobre fluxos editoriais, login owner, canonical/noindex, teclado, viewport de 360 × 800 e aliases. Gates focados podem executar arquivos individuais para produzir feedback rápido, mas o merge final deve preservar evidência do agregado relevante.

## Backup

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

A implementação recusa overwrite e verifica integridade, foreign keys e migrations `0001`–`0013`. As fixtures restauram conteúdo editorial e dados operacionais de orquestração.

## Registro de passagem

Uma passagem deve registrar:

- branch, commit e árvore de merge exatos;
- versões de Node e pnpm;
- comandos e códigos de saída;
- contagem de arquivos/testes;
- migrations presentes no SSR e ausentes no cliente;
- rotas, viewport e navegador usados no Playwright;
- integridade/foreign keys do backup;
- falhas reais separadas de indisponibilidade do ambiente;
- IDs de workflow usados como evidência.

Não reutilize contagens ou run IDs antigos depois de modificar arquivos cobertos pelo gate.