# Tutorial da toolchain offline do SemogSite

Este guia explica como preparar o `Semogtw/SemogSite` em um ambiente Linux x64 sem acesso direto ao npm, aos downloads do Playwright ou aos binários nativos usados pelo projeto.

A toolchain é fabricada no repositório público [`Semogtw/Offline-Toolchains`](https://github.com/Semogtw/Offline-Toolchains). Ela contém apenas ferramentas, dependências públicas e caches reproduzíveis. O código do site, configurações privadas, credenciais e secrets não fazem parte do pacote.

## O que o pacote fornece

O artifact validado inclui:

- Node.js 22 para Linux x64, incluindo headers;
- pnpm e um store offline com as dependências públicas do stack;
- Chromium do Playwright;
- bibliotecas compartilhadas necessárias ao navegador;
- binário verificado do `better-sqlite3` para a versão e ABI do Node empacotados;
- scripts de ativação, instalação, hidratação nativa e diagnóstico;
- lockfile de referência, manifesto, inventário de software e checksums SHA-256.

O baseline cobre TanStack Start/Router/Query, React, Hono, Zod, Drizzle, SQLite, Radix UI, TypeScript, Vite, Vitest, Testing Library, Playwright e Wrangler.

> A toolchain é específica para Linux x64. Não reutilize o binário de SQLite em outra arquitetura, sistema operacional ou ABI do Node.

## Pré-requisitos mínimos

A máquina que recebe o pacote precisa ter:

```text
bash
tar
zstd
unzip
sha256sum
```

Também reserve alguns gigabytes livres para os ZIPs, o archive remontado, o pacote extraído e `node_modules`.

## 1. Encontrar o artifact mais recente

Os artifacts expiram após um dia. O issue permanente abaixo recebe um recibo de cada execução e informa o run, o resultado, os IDs, os tamanhos e a expiração:

- [`Offline-Toolchains` issue #8 — Toolchain artifact catalog](https://github.com/Semogtw/Offline-Toolchains/issues/8)

Procure o comentário mais recente com o título **SemogSite Node and pnpm offline toolchain** e confirme:

1. `conclusion: success`;
2. `expired: false` em todos os artifacts;
3. presença de um artifact `manifest`;
4. presença de todas as partes `part-00`, `part-01` e quaisquer partes adicionais declaradas.

Os nomes seguem este formato:

```text
semogsite-toolchain-linux-x64-manifest
semogsite-toolchain-linux-x64-part-00
semogsite-toolchain-linux-x64-part-01
...
```

Nunca misture partes de runs diferentes.

### Download pelo navegador

Abra a URL do run indicada no recibo, entre na seção **Artifacts** e baixe o manifesto e todas as partes.

### Download com GitHub CLI

Quando `gh` e acesso ao GitHub estiverem disponíveis:

```bash
export RUN_ID="SUBSTITUA_PELO_RUN_ID"
mkdir -p ./downloads/semogsite-toolchain

for artifact in \
  semogsite-toolchain-linux-x64-manifest \
  semogsite-toolchain-linux-x64-part-00 \
  semogsite-toolchain-linux-x64-part-01
do
  gh run download "$RUN_ID" \
    --repo Semogtw/Offline-Toolchains \
    --name "$artifact" \
    --dir ./downloads/semogsite-toolchain
done
```

Consulte o manifesto antes de assumir que existem apenas duas partes. Adicione ao comando qualquer `part-NN` adicional listada no recibo.

### Download em uma sessão com conector GitHub

Uma sessão de agente que não possui rede direta pode usar o conector GitHub para:

1. ler o comentário mais recente do issue `#8`;
2. selecionar somente um run concluído com sucesso;
3. baixar o artifact de manifesto e todas as partes pelo ID;
4. salvar os ZIPs ou arquivos retornados no ambiente local da sessão.

O conector deve baixar os bytes do artifact; copiar apenas a URL ou o ID não prepara a toolchain.

## 2. Extrair os ZIPs e verificar as partes

Coloque todos os downloads em uma pasta e extraia-os para um único diretório:

```bash
mkdir -p ./downloads/semogsite-toolchain/parts

for zip in ./downloads/semogsite-toolchain/*.zip; do
  unzip -o "$zip" \
    -d ./downloads/semogsite-toolchain/parts
done

cd ./downloads/semogsite-toolchain/parts
```

Quando a ferramenta de download já entregar os arquivos internos extraídos, pule apenas o `unzip` e mantenha todos os arquivos no mesmo diretório.

Valide cada parte antes de remontar:

```bash
sha256sum -c SHA256SUMS.parts
```

O comando deve terminar sem falhas. Não continue se uma parte estiver ausente ou com hash diferente.

## 3. Remontar e verificar o archive

Ainda dentro do diretório `parts`:

```bash
cat semogsite-toolchain-linux-x64.part-* \
  > semogsite-toolchain-linux-x64.tar.zst

sha256sum -c semogsite-toolchain-linux-x64.tar.zst.sha256
```

A ordem lexicográfica funciona porque as partes usam índice com zero à esquerda: `part-00`, `part-01`, `part-02` e assim por diante.

Se o checksum final falhar, apague o archive remontado, confira se todas as partes vieram do mesmo run e repita a montagem.

## 4. Extrair a toolchain

Escolha uma pasta persistente fora do repositório do site. Um exemplo para uso local:

```bash
export SEMOGSITE_TOOLCHAINS_HOME="$HOME/.local/share/semogtw"
mkdir -p "$SEMOGSITE_TOOLCHAINS_HOME"

tar --zstd \
  -xf semogsite-toolchain-linux-x64.tar.zst \
  -C "$SEMOGSITE_TOOLCHAINS_HOME"

export SEMOGSITE_TOOLCHAIN="$SEMOGSITE_TOOLCHAINS_HOME/semogsite-toolchain"
```

Em ambientes temporários, `/tmp/semogtw` ou o diretório de trabalho da sessão também podem ser usados.

Não versione a pasta extraída, os ZIPs, o archive ou `node_modules` no repositório do site.

## 5. Ativar e diagnosticar o ambiente

A ativação modifica apenas o shell atual:

```bash
source "$SEMOGSITE_TOOLCHAIN/scripts/activate.sh"
```

Depois execute o diagnóstico da própria toolchain:

```bash
bash "$SEMOGSITE_TOOLCHAIN/scripts/doctor.sh"
```

O diagnóstico deve reconhecer Node, pnpm, o store offline, o navegador e os assets nativos. Mantenha o mesmo shell ativado para os passos seguintes.

Para confirmar as versões principais manualmente:

```bash
node --version
pnpm --version
pnpm exec playwright --version
```

## 6. Instalar as dependências do SemogSite sem rede

Entre no checkout do site:

```bash
cd /caminho/para/SemogSite
```

### Projeto com lockfile existente

Este é o modo normal e mais seguro. O instalador exige que o lockfile corresponda aos manifests:

```bash
bash "$SEMOGSITE_TOOLCHAIN/scripts/install-offline.sh" "$PWD"
```

Depois valide o workspace:

```bash
bash "$SEMOGSITE_TOOLCHAIN/scripts/doctor.sh" "$PWD"
```

O instalador:

- força o pnpm a usar o store incluído no pacote;
- usa resolução offline;
- não executa scripts de lifecycle das dependências;
- restaura o binário verificado do `better-sqlite3` no local esperado pelo pacote instalado.

### Bootstrap intencional sem lockfile ou após editar dependências

Use este modo somente quando a criação ou atualização do lockfile for deliberada:

```bash
SEMOGSITE_FROZEN_LOCKFILE=0 \
  bash "$SEMOGSITE_TOOLCHAIN/scripts/install-offline.sh" "$PWD"
```

O pnpm ainda trabalha sem rede. Portanto, todas as versões necessárias precisam existir no store empacotado. Revise e versione o `pnpm-lock.yaml` gerado antes de continuar o desenvolvimento.

Não use `SEMOGSITE_FROZEN_LOCKFILE=0` apenas para esconder divergências inesperadas entre o manifest e o lockfile.

## 7. Executar comandos sempre em modo offline

O wrapper abaixo ativa a toolchain e força o uso do store empacotado:

```bash
"$SEMOGSITE_TOOLCHAIN/bin/pnpm-offline" \
  --dir "$PWD" \
  test
```

Outros exemplos:

```bash
"$SEMOGSITE_TOOLCHAIN/bin/pnpm-offline" --dir "$PWD" typecheck
"$SEMOGSITE_TOOLCHAIN/bin/pnpm-offline" --dir "$PWD" build
"$SEMOGSITE_TOOLCHAIN/bin/pnpm-offline" --dir "$PWD" exec playwright test
```

Em um monorepo, use os gates versionados no workspace:

```bash
pnpm check
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` limpa somente o banco dedicado `data/semogtw-e2e.sqlite`, recompila o app, inicia o adapter Node local e usa o Chromium fornecido pela toolchain. Não execute `playwright install` em uma sessão offline.

## 8. Playwright e Chromium

A ativação define `PLAYWRIGHT_BROWSERS_PATH` para o navegador incluído na toolchain. Não execute `playwright install` em uma sessão offline.

Um teste rápido de lançamento pode ser feito com:

```bash
pnpm exec node --input-type=module <<'NODE'
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent('<main>SemogSite offline</main>');
console.log(await page.locator('main').textContent());
await browser.close();
NODE
```

A saída esperada contém:

```text
SemogSite offline
```

## 9. Fluxo recomendado para agentes sem rede direta

Uma sessão de desenvolvimento deve seguir esta ordem:

1. localizar a branch com desenvolvimento real mais recente do `SemogSite`;
2. localizar o último run bem-sucedido da toolchain no issue `Offline-Toolchains#8`;
3. baixar manifesto e todas as partes;
4. verificar hashes e remontar o archive;
5. extrair e ativar a toolchain;
6. executar o `doctor` da toolchain;
7. instalar o checkout com `install-offline.sh`;
8. executar o `doctor` contra o workspace;
9. rodar os gates disponíveis localmente;
10. documentar qualquer gate que dependa de uma versão ainda ausente no pacote;
11. continuar o trabalho resolvível por código, sem substituir os testes locais por GitHub Actions salvo quando for realmente essencial.

Uma toolchain verde prova o transporte e o ambiente de dependências. Ela não substitui os testes do código atual do site.

## 10. Quando regenerar o pacote

Regere a toolchain quando houver mudança em qualquer um destes itens:

- versão do Node ou do pnpm;
- `package.json` de qualquer workspace;
- `pnpm-workspace.yaml`;
- `pnpm-lock.yaml`;
- política `allowBuilds` do pnpm;
- Playwright ou versão do Chromium;
- Wrangler;
- Drizzle ou `better-sqlite3`;
- ABI do Node;
- lógica de hidratação dos assets nativos.

No repositório `Offline-Toolchains`:

1. atualize `fixtures/semogsite/workspace/package.json` e os demais inputs públicos para refletirem o workspace real;
2. preserve apenas dependências e metadados públicos;
3. nunca copie tokens, secrets, URLs privadas ou configuração de produção para o fixture;
4. atualize `triggers/semogsite-toolchain.json` para solicitar uma nova fabricação;
5. acompanhe o novo recibo no issue `#8`;
6. valide o novo artifact antes de considerá-lo baseline.

## 11. Erros comuns

### `ERR_PNPM_NO_OFFLINE_META` ou pacote ausente

A versão solicitada não existe no store empacotado. Não há correção inteiramente offline: atualize o fixture em um ambiente com rede e gere um novo artifact.

### `ERR_PNPM_OUTDATED_LOCKFILE`

Os manifests e o lockfile divergem. Confirme se a mudança foi intencional. Para atualizar deliberadamente o lock com versões já presentes no store, use `SEMOGSITE_FROZEN_LOCKFILE=0` e revise o diff gerado.

### `better_sqlite3.node` não encontrado

Execute novamente:

```bash
bash "$SEMOGSITE_TOOLCHAIN/scripts/install-offline.sh" "$PWD"
bash "$SEMOGSITE_TOOLCHAIN/scripts/doctor.sh" "$PWD"
```

Se a ABI do Node do shell não for a mesma do manifesto da toolchain, reative o pacote correto. Uma mudança de ABI exige nova fabricação.

### Playwright tenta baixar o navegador

Confirme que a ativação foi executada no shell atual:

```bash
source "$SEMOGSITE_TOOLCHAIN/scripts/activate.sh"
printf '%s\n' "$PLAYWRIGHT_BROWSERS_PATH"
```

Use o navegador do pacote e não rode `playwright install` offline.

### `zstd` não encontrado

O `zstd` é necessário para extrair o archive antes que a toolchain possa ser ativada. Instale-o previamente no sistema ou disponibilize seu binário por outro meio confiável.

### Artifact expirado

Os artifacts têm retenção curta. Solicite uma nova execução no `Offline-Toolchains`; não reutilize partes incompletas de runs antigos.

## 12. Limites e segurança

- Use somente artifacts produzidos por commits confiáveis do `Offline-Toolchains`.
- Valide os hashes antes de extrair ou executar qualquer conteúdo.
- Não misture manifests e partes de runs diferentes.
- Não versione archives, caches, browsers, binários nativos ou `node_modules` no `SemogSite`.
- O pacote atual é um baseline de dependências. Após o workspace real evoluir, o fixture público e o lockfile de referência precisam acompanhar essa evolução.
- Secrets de autenticação, banco, GitHub, Cloudflare ou qualquer host de produção devem continuar fora dos artifacts e do Git.

## Checklist rápido

```text
[ ] Encontrei o recibo mais recente com conclusion: success
[ ] Baixei o manifest e todas as partes do mesmo run
[ ] sha256sum -c SHA256SUMS.parts passou
[ ] O SHA-256 do archive remontado passou
[ ] Extraí a toolchain fora do repositório
[ ] Ativei o shell com scripts/activate.sh
[ ] O doctor da toolchain passou
[ ] A instalação offline do workspace passou
[ ] O doctor contra o workspace passou
[ ] Rodei todos os gates já disponíveis no projeto
[ ] Documentei qualquer dependência ausente ou necessidade de regeneração
```
