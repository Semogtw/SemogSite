# SemogSite

Plataforma pessoal da identidade **Semogtw**, composta por uma área pública editorial, o **Semogtw DevOS** privado e uma futura integração MCP sobre os mesmos contratos de domínio.

O projeto usa uma arquitetura portátil em TypeScript, com TanStack Start/Router, React, Hono, Zod, Drizzle ORM, SQLite e pnpm workspaces. A implementação deve permanecer desacoplada de um provedor de hospedagem específico.

## Documentação essencial

- [Tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md) — download, remontagem, instalação sem rede, Chromium, SQLite nativo e solução de problemas.
- [Especificação da fundação](docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md) — arquitetura, domínio, segurança, rotas e sistema visual.
- [Plano de implementação da fundação](docs/superpowers/plans/2026-08-01-semogtw-platform-foundation.md) — sequência de construção e gates.
- [Referência upstream](docs/UPSTREAM_REFERENCE.md) — rastreabilidade das decisões herdadas e adaptadas.

## Ambiente sem acesso à internet

Não tente baixar dependências individualmente em uma sessão isolada. Use o pacote reproduzível fabricado em [`Semogtw/Offline-Toolchains`](https://github.com/Semogtw/Offline-Toolchains).

Fluxo resumido:

1. encontre no issue `Offline-Toolchains#8` o recibo mais recente do SemogSite com `conclusion: success`;
2. baixe o manifesto e todas as partes do mesmo run;
3. valide os hashes e remonte o archive;
4. extraia e ative a toolchain;
5. execute o instalador offline no checkout;
6. rode o diagnóstico e os gates disponíveis.

Os comandos completos e os procedimentos de recuperação estão no [tutorial da toolchain offline](docs/OFFLINE_TOOLCHAIN.md).

## Regras de segurança

- Não exponha dados privados por loaders, APIs, metadados, sitemap, HTML ou DTOs públicos.
- Não versione secrets, tokens, hashes de senha de produção, bancos locais, artifacts, caches ou `node_modules`.
- Não apresente capacidades de hospedagem ainda não verificadas como disponíveis.
- Mudanças sensíveis ou destrutivas devem produzir auditoria.
- A área `/devos` e as APIs privadas devem falhar fechadas quando a autenticação não estiver configurada.

## Estado atual

A documentação de produto e fundação é o contrato vigente. O pacote offline inicial representa o stack aprovado enquanto os manifests e o lockfile definitivos do workspace são consolidados. Quando esses arquivos mudarem, a toolchain deve ser regenerada antes de ser tratada como ambiente determinístico.
