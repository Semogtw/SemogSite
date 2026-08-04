# Decisão de hospedagem do SemogSite

**Data da decisão:** 2026-08-03  
**Estado:** decisão arquitetural atual; migração e provas no runtime real ainda pendentes.  
**Repositório relacionado:** `Semogtw/goanime-mobile`.

## Decisão

O alvo principal de produção do SemogSite é **Cloudflare Workers + D1**.

```text
Cloudflare
├── Worker do SemogSite
│   ├── TanStack Start
│   ├── rotas públicas
│   ├── DevOS privado
│   └── API Hono adaptada ao runtime Worker
├── D1
│   ├── conteúdo e projeções
│   ├── autenticação e sessões
│   ├── workflow orchestration
│   └── estado operacional privado
├── Static Assets
│   └── assets públicos versionados
└── Worker MCP futuro
    └── endpoint remoto autenticado e separado

Oracle Cloud Always Free
└── reservada para a origem completa da Metadata API do GoAnime-Mobile
```

GPT Sites está rejeitado e não deve aparecer como candidato ativo. A VM Oracle não é o host-alvo do SemogSite. O projeto continua portável, mas o próximo adapter de produção a ser implementado é Cloudflare.

## Motivos

O projeto ainda está em desenvolvimento e aceita mudanças de adapter. A separação atual entre domínio, contratos, autenticação, banco e aplicações permite migrar o runtime sem levar detalhes da Cloudflare para `packages/domain`.

Cloudflare é preferida porque:

- oferece runtime gerenciado adequado para TanStack Start e Hono;
- elimina manutenção de VM, Docker, Caddy e processos permanentes para o Site;
- separa a disponibilidade do Site da disponibilidade da stack Jikan;
- atende melhor a uma aplicação pessoal de baixa concorrência;
- permite deploy distribuído e assets estáticos na mesma plataforma;
- D1 mantém um modelo relacional próximo ao SQLite;
- existe caminho para MCP HTTP stateless sem colocar o catálogo ou a autorização dentro do domínio;
- o plano gratuito é o requisito operacional; qualquer recurso pago precisa de nova decisão explícita.

## Arquitetura de adapters

O projeto não deve substituir portabilidade por dependência estrutural da Cloudflare.

```text
packages/domain
packages/contracts
packages/auth
        │
        ├── adapter Node + better-sqlite3
        │     └── desenvolvimento local, testes, exportação e fallback portátil
        │
        └── adapter Cloudflare + D1
              └── produção escolhida
```

Regras:

- `packages/domain` não importa Wrangler, D1, Workers, Hono runtime ou bindings Cloudflare;
- o adapter D1 implementa os mesmos contratos de repositório usados pelos serviços atuais;
- o adapter Node não deve ser removido antes de o caminho D1 passar por migrations, testes e rollback;
- nenhuma rota privada confia em identidade ou headers fornecidos pelo cliente;
- secrets permanecem somente no runtime;
- filesystem local não é fonte canônica em produção Cloudflare.

## Mudanças esperadas

### Web e API

- adicionar adapter de build e execução para Cloudflare Workers;
- substituir o servidor Node de produção pelo entrypoint Worker;
- manter o servidor Node atual para desenvolvimento e validação portátil;
- integrar a superfície Hono ao mesmo Worker inicialmente, evitando dois deploys sem necessidade;
- preservar `/api/v1/public/*`, `/api/v1/private/*` e `/health` com os mesmos contratos e políticas de cache.

### Banco

- criar composição D1 separada da composição `better-sqlite3`;
- validar todas as migrations no D1, sem presumir equivalência perfeita com SQLite local;
- revisar transações, concorrência, geração de IDs, timestamps, limites e paginação;
- substituir backup por cópia de arquivo por exportação e restauração adequadas ao D1;
- manter testes de conformidade executáveis contra os dois adapters.

### Autenticação

- manter `AuthProvider` como fronteira;
- portar sessões, revogação, digests e CSRF para repositórios D1;
- preservar autenticação fail-closed antes de qualquer leitura privada;
- não adotar identidade de plataforma como substituto automático da autorização da aplicação.

### MCP remoto

O MCP remoto permanece uma fase separada. O adapter Cloudflare deve:

- usar HTTPS e OAuth compatível com o design aprovado;
- validar audience/resource e escopo `devos.read`;
- criar contexto e servidor por requisição;
- permanecer read-only na primeira versão;
- ter kill switch, rate limit, timeout e logs sanitizados;
- não depender de cookies do DevOS.

## Relação com o GoAnime-Mobile

A decisão conjunta é:

| Sistema | Host principal |
| --- | --- |
| SemogSite | Cloudflare Workers + D1 |
| Metadata API pública | Cloudflare Worker de entrada/cache/fallback |
| Jikan completo | Oracle Cloud Always Free A1 |

O Site não acessa MongoDB, Redis, Typesense ou volumes do Jikan. O GoAnime-Mobile não acessa o D1 privado do DevOS. Qualquer integração futura usa contrato HTTP mínimo e autenticado.

Essa separação evita que uma falha da Oracle derrube o Site e evita que deploys, builds ou migrations do Site concorram com indexação e manutenção do Jikan.

## Decisões rejeitadas

- GPT Sites não é candidato atual nem fallback.
- SemogSite e Jikan não devem compartilhar a VM Oracle como arquitetura-alvo.
- Vercel mais banco externo não é o caminho principal, pois fragmenta runtime, banco e operação sem vantagem suficiente.
- Google e2-micro não é o alvo, pois volta a exigir administração de VM com recursos menores.
- Supabase, Render, Koyeb ou créditos temporários não substituem uma gratuidade permanente comprovada.
- R2 não deve ser habilitado apenas por conveniência; assets estáticos e D1 são preferidos até existir requisito real de blobs.

## Guardas de custo

- Workers e D1 devem operar dentro das cotas gratuitas verificadas no momento da implantação;
- não ativar Cloudflare Containers pagos;
- não habilitar faturamento de R2 sem decisão específica e limites operacionais;
- consultas D1 devem ser indexadas e paginadas;
- jobs recorrentes devem ser mínimos e medidos;
- nenhuma integração externa pode transformar ausência de quota em cobrança silenciosa;
- exceder uma cota deve degradar de forma explícita, não migrar automaticamente para recurso pago.

## Sequência de implementação

1. registrar e testar contratos de conformidade dos repositórios atuais;
2. adicionar configuração e build Worker sem remover o runtime Node;
3. implementar adapter D1 por domínio, começando por leitura pública e migrations;
4. portar autenticação e sessões;
5. portar escritas privadas e auditoria;
6. executar testes públicos, privados, migrations, concorrência e rollback;
7. implantar preview Cloudflare com secrets e domínio provisório;
8. promover o Site somente depois de provar backup e restauração;
9. implementar MCP remoto em fase separada.

## Critérios de promoção

A Cloudflare só se torna produção confirmada quando:

- build e startup do Worker passam no commit promovido;
- todas as migrations aplicam em base nova e base atualizada;
- os adapters Node e D1 passam testes de conformidade equivalentes;
- login, revogação, CSRF e rotas privadas falham fechados;
- conteúdo privado não aparece em resposta pública, asset ou log;
- exportação e restauração do D1 são executadas e verificadas;
- rollback de código e schema está documentado;
- limites gratuitos são medidos com carga representativa;
- não existe dependência obrigatória de serviço pago;
- indisponibilidade do Jikan não impede acesso ao Site e ao DevOS.

## Documentos relacionados

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md): fronteiras e modos de implantação.
- [`SITES_CAPABILITY_ASSESSMENT.md`](SITES_CAPABILITY_ASSESSMENT.md): avaliação histórica de GPT Sites, supersedida para seleção de host por este documento.
- [`superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md`](superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md): requisitos do MCP remoto.
- `Semogtw/goanime-mobile/docs/cross_project_hosting_decision.md`: decisão correspondente da Metadata API.

Este documento é a fonte proprietária para seleção do host do SemogSite. Detalhes de implementação devem permanecer nos planos e runbooks específicos sem reabrir a decisão de plataforma implicitamente.
