# Project case study authoring template

Use this structure when preparing a public `project` editorial document for the Portfolio V1 surface. It is an authoring convention, not a new public API contract.

The existing published editorial projection remains authoritative: title, excerpt, body Markdown, tags and publication metadata are public only after the normal review/approval/publication flow.

## Required editorial intent

A case study should help a reviewer understand:

- what problem or need motivated the project;
- what was actually built;
- which part of the work was owned by Semogtw;
- why relevant technical decisions were made;
- which technologies were used in meaningful ways;
- which trade-offs or constraints affected the solution;
- how the result was verified;
- what the current public result or learning is.

Do not publish private DevOS state, private branch names, operational blockers, internal run payloads, credentials, tokens, private repository data or evidence that has not been reviewed for public exposure.

## Recommended metadata

Use the editorial fields consistently:

```text
title    concise project/case-study name
excerpt  one or two sentences describing the problem and result
tags     technologies or technical themes actually demonstrated
body     the case-study content below
```

Tags should describe evidence visible in the case study. Avoid adding a technology just because it appears somewhere in the repository.

## Markdown skeleton

```md
## Contexto e problema

Explique por que o projeto existe, qual problema foi atacado e quais restrições importavam.

## Minha atuação

Descreva de forma objetiva o que foi projetado, implementado, investigado ou mantido por você. Em trabalhos colaborativos, deixe a divisão de responsabilidade clara.

## Solução

Resuma a solução construída antes de entrar nos detalhes técnicos.

## Decisões técnicas

### Decisão relevante

Explique a decisão, as alternativas consideradas quando isso for útil e o motivo da escolha.

## Tecnologias utilizadas

Liste somente tecnologias que tenham papel explicável no projeto e descreva esse papel no texto, em vez de formar uma parede de logos.

## Desafios e trade-offs

Registre problemas relevantes, limites conhecidos e compromissos feitos durante a implementação.

## Verificação

Explique como o comportamento foi provado: testes automatizados, typecheck, builds, smoke tests, validação manual reproduzível, benchmarks ou outra evidência apropriada.

## Resultado e estado atual

Descreva o que funciona publicamente hoje, o que foi aprendido e, quando relevante, quais limitações permanecem.

## Links públicos

Inclua somente repositórios, demos, documentação ou referências deliberadamente públicas e revisadas.
```

## Evidence rules

A statement such as “supports X”, “is secure against Y”, “improved Z” or “passes N tests” should be backed by evidence current enough for the published revision. Historical test counts must not be copied forward after covered code changes.

Prefer specific, inspectable statements. Avoid proficiency claims such as `advanced`, `expert`, `90%` or similar labels unless a clearly defined external standard actually justifies them.

## Portfolio consistency

The visual route intentionally renders the published Markdown without inferring private metadata. Therefore the authoring structure above carries the semantic depth of a case study while preserving the existing confidentiality boundary.
