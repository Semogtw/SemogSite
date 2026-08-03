# Testes e gates

A política do projeto é evidência antes de declaração. Código, migrations ou documentação não tornam uma fase “aprovada” até que os gates relevantes sejam executados no HEAD correspondente.

## Preparação

```bash
corepack enable
pnpm install --frozen-lockfile
```

Em ambiente sem rede, use `docs/OFFLINE_TOOLCHAIN.md`. O artifact fornece Node, pnpm, store, `better-sqlite3` e Chromium; a instalação deve usar o lockfile frozen e zero downloads.

## Gate agregado

```bash
pnpm check
```

O comando executa guardrails, fronteiras de pacote, confidencialidade, typechecks e Vitest. Em runners muito restritos, o processo Vitest agregado pode manter handles abertos. Isso não autoriza pular cobertura: execute os workspaces em lotes determinísticos com pool de threads e registre cada saída.

Exemplo estável:

```bash
pnpm --filter @semogtw/domain exec vitest run --pool=threads --maxWorkers=4 --minWorkers=1
pnpm --filter @semogtw/contracts exec vitest run --pool=threads --maxWorkers=4 --minWorkers=1
pnpm --filter @semogtw/web exec vitest run --pool=threads --maxWorkers=4 --minWorkers=1
```

A suíte de banco pode ser dividida por arquivos quando o processo agregado não encerra. Todos os lotes precisam passar; timeout do parent process não equivale a teste aprovado nem a teste falho.

## Evidência observada em 2026-08-03

Checkpoint remoto de código e backup: `1190f738b303912174f69267b2c961037202669f`.

| Workspace | Arquivos | Testes | Resultado |
| --- | ---: | ---: | --- |
| `@semogtw/domain` | 36 | 208 | aprovado |
| `@semogtw/database` | 46 | 127 | aprovado em 3 lotes determinísticos |
| `@semogtw/contracts` | 2 | 10 | aprovado |
| `@semogtw/web` | 26 | 74 | aprovado |
| `@semogtw/api` | 4 | 9 | aprovado |
| `@semogtw/mcp-app` | 1 | 1 | aprovado |
| `@semogtw/auth` | 3 | 7 | aprovado |
| `@semogtw/config` | 1 | 2 | aprovado |
| `@semogtw/github` | 6 | 24 | aprovado |
| `@semogtw/mcp` | 13 | 65 | aprovado |
| `@semogtw/ui` | 2 | 2 | aprovado |
| **Total dos workspaces** | **140** | **529** | **aprovado** |

Os scripts Node de guardrail foram executados separadamente por `pnpm test:guardrails` e não estão incluídos nessa contagem Vitest. Todos os typechecks de workspace passaram; o build cliente/SSR confirmou 10 migrations no servidor; o Playwright passou 2/2 após remover um processo de servidor órfão deixado por uma interrupção do harness.

## Gates editoriais especializados

A matriz detalhada está em `docs/testing/2026-08-01-editorial-test-matrix.md`. Os gates cobrem:

- lifecycle, hash exato e concorrência otimista;
- atomicidade e replay idempotente no SQLite;
- confidencialidade entre draft privado e projeção pública;
- renderer Markdown sem HTML bruto e links restritos;
- canonical/noindex;
- registry append-only de aliases;
- redirect `308` same-origin com `no-store`;
- revogação observável no mesmo navegador;
- backup/restauração com alias, publicação e draft privado.

## Build e migrations SSR

```bash
pnpm build
```

O gate precisa confirmar:

- build de todos os workspaces;
- bundle cliente e SSR;
- 10 migrations no servidor;
- nenhuma migration no cliente;
- dependências nativas exigidas pelo runtime Node.

## Browser gate

```bash
pnpm test:e2e
```

O Playwright versionado cobre login owner, criação/review/aprovação, publicação, novo draft sem vazamento, rollback, retirada, canonical/noindex, teclado, viewport de 360×800 e o ciclo de alias: criar, receber `308`/`Location`/`no-store`, navegar pela URL antiga, revogar e observar not-found na mesma sessão.

## Backup gate

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw.sqlite
pnpm verify:backup -- ./backups/semogtw.sqlite ./data/semogtw.sqlite
```

Além do comando operacional, a fixture `packages/database/src/backup/sqlite-backup.test.ts` restaura publicação, draft privado, review, eventos e alias append-only.

## Registro de passagem

Uma passagem deve registrar:

- commit e árvore Git exatos;
- versões de Node e pnpm;
- comandos e códigos de saída;
- contagem de arquivos/testes por workspace;
- migrations presentes no SSR;
- rotas, viewport e navegador usados no Playwright;
- resultado de integridade/foreign keys do backup;
- qualquer timeout de harness separado de falhas reais.
