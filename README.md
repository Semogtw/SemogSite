# Semogtw Site

Meu site pessoal e portfólio de projetos.

A ideia é reunir em um só lugar os sistemas que construo, as tecnologias que uso, minha formação e os aprendizados que surgem durante o desenvolvimento — sempre tentando mostrar **trabalho real e contexto**, em vez de apenas listas de ferramentas ou barras de proficiência.

## O que você encontra aqui

### Projetos

Os projetos são a parte principal do portfólio. Cada case study é pensado para explicar não só o resultado final, mas também o problema, as decisões tomadas, a arquitetura, os trade-offs e o que foi aprendido no processo.

### Habilidades

As tecnologias aparecem ligadas aos projetos em que foram utilizadas. O objetivo é mostrar conhecimento por meio de aplicação prática.

Áreas que aparecem com mais frequência no projeto:

- desenvolvimento web e produto;
- backend e APIs;
- bancos de dados e persistência;
- automação e engenharia de software;
- ferramentas e workflows para desenvolvimento assistido por agentes.

### Formação e certificados

O site também reúne minha formação acadêmica, estudos em andamento e certificados concluídos, sempre deixando claro o status de cada item.

### Notas e trajetória

Além dos projetos, existem espaços para registrar decisões técnicas, aprendizados e a evolução da minha formação ao longo do tempo.

## Semogtw DevOS

O repositório também contém o **Semogtw DevOS**, uma área privada que uso para organizar e acompanhar meu próprio processo de desenvolvimento.

Ele reúne ferramentas para projetos, workflows, sessões de trabalho, evidências, publicação de conteúdo e automações. Essa parte existe como infraestrutura pessoal; o foco público do projeto continua sendo o portfólio.

## Tecnologias

O projeto é desenvolvido principalmente com:

**TypeScript · React · TanStack · Hono · Zod · Drizzle · SQLite / Cloudflare D1 · Cloudflare Workers · Vitest · Playwright**

A arquitetura foi pensada para manter a interface pública separada das ferramentas privadas e permitir evolução sem depender de um único ambiente de execução.

## Estado atual

A estrutura principal do portfólio já inclui:

- Home;
- Projetos e case studies;
- Habilidades;
- Formação e certificados;
- Sobre;
- Contato;
- Trajetória;
- Notas técnicas;
- SEO e descoberta;
- experiência responsiva e acessível;
- fluxo de publicação que separa rascunhos privados de conteúdo público.

O foco atual é aumentar a qualidade do conteúdo público: publicar os primeiros case studies completos, adicionar credenciais verificáveis e refinar a apresentação visual usando projetos reais.

## Desenvolvimento

Este é um projeto pessoal em evolução contínua. A linha de desenvolvimento mais recente do portfólio está em `develop/public-portfolio-v1` até sua integração na branch principal.

Para quem quiser explorar a implementação:

```bash
pnpm install
pnpm dev
```

A documentação técnica mais detalhada está na pasta [`docs/`](docs/).

Alguns pontos de entrada úteis:

- [`docs/SITE_STATUS.md`](docs/SITE_STATUS.md) — estado atual e próximos passos;
- [`docs/PUBLIC_PORTFOLIO.md`](docs/PUBLIC_PORTFOLIO.md) — estrutura e decisões do portfólio;
- [`docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md`](docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md) — formato usado para documentar projetos.

---

Feito para servir como portfólio, laboratório pessoal e registro da evolução dos meus projetos de software.
