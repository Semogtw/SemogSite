# Semogtw Design System

## Direção

A identidade combina composição editorial pública com densidade operacional no Semogtw DevOS. O objetivo é parecer uma ferramenta de engenharia pessoal, silenciosa e precisa — não um dashboard SaaS genérico, currículo ou template de PDI.

## Tokens

Os tokens canônicos vivem em `packages/ui/src/styles/tokens.css`.

- fundo: `#0b0d12`;
- superfícies: `#11141b`, `#171b24`, `#202633`;
- borda: `#2b3342`;
- texto: `#f4f7fb`;
- texto secundário: `#98a2b3`;
- primária: `#7c8cff`;
- sucesso: `#38c793`;
- atenção: `#e8b455`;
- perigo: `#ef6a72`;
- informação: `#52a7ff`.

A escala de espaçamento usa base de 4 px. Alvos interativos têm no mínimo 44 px. Raios ficam entre 10 e 14 px. Números operacionais usam algarismos tabulares.

## Tipografia

A fundação usa uma pilha de sistema com Inter como preferência. Não há dependência de Google Fonts no HTML público. Fontes externas só serão introduzidas se puderem ser auto-hospedadas ou carregadas sem comprometer privacidade e desempenho.

## Família de ícones

A família escolhida é **Lucide**, verificada por meio do Supericons em 1 de agosto de 2026. A aplicação usa traço outline uniforme e tamanho padrão de 18–20 px.

| Conceito | Ícone Lucide |
|---|---|
| Início | `Gauge` |
| Hoje | `CalendarCheck2` |
| Projetos | `FolderKanban` |
| Roadmap | `ListChecks` |
| Operação | `Workflow` |
| Mais | `Ellipsis` |
| Busca | `Search` |
| Capturar | `SquarePen` |
| Configurações | `Settings` |
| Evidência | `FileCheck` |
| GitHub | `Github` |
| Sincronizar | `RefreshCw` |
| Atenção | `CircleAlert` |
| Sucesso | `CircleCheck` |
| Bloqueado | `Ban` |
| Link externo | `ExternalLink` |

Ícones decorativos recebem `aria-hidden`. Ícones que comunicam estado recebem nome acessível e nunca são a única forma de diferenciar estados.

## Primitivas

- `Button`: ações primária, neutra e destrutiva;
- `Surface`: agrupamento neutro sem gradiente;
- `Status`: estado com ícone, texto e cor;
- `EmptyState`: ausência intencional de dados;
- `ErrorState`: erro acionável e sanitizado;
- `PublicHeader`: navegação editorial;
- `DevOSSidebar`: navegação operacional desktop;
- `DevOSBottomNav`: cinco destinos em telas compactas.

## Responsividade

- compacta: até 599 px;
- média: 600–1023 px;
- ampla: 1024 px ou mais.

A barra inferior mobile reserva área segura do sistema. Nenhuma tabela é obrigatória em telas compactas. Boards viram seções ordenadas, evitando rolagem horizontal.

## Acessibilidade

- contraste orientado a WCAG AA;
- foco visível global;
- labels reais em formulários;
- estados não dependem apenas de cor;
- `prefers-reduced-motion` reduz animações e transições;
- componentes interativos respeitam área mínima de toque;
- gráficos futuros devem ter resumo textual equivalente.

## Relação com a referência upstream

O `pdi-template` foi usado apenas como referência de composição, responsividade e padrões de navegação. `GradientCard`, gradientes, branding, textos e taxonomia de PDI não foram importados. As superfícies Semogtw foram reconstruídas com tokens próprios e menor ruído visual.
