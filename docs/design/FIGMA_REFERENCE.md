# Figma Reference

**Review date:** 2026-08-01  
**Connected handle:** Semog  
**Current access:** Starter plan seat reported as `View`

The connected Figma account does not currently expose an editable seat through the integration. No design file URL is recorded because creating frames without edit permission would produce a false completion claim.

## Required pages and frames

When edit access becomes available, create these names exactly:

```text
Foundations / Color
Foundations / Type
Foundations / Spacing
Components / Public
Components / DevOS
Public / Home / 390
Public / Home / 1440
DevOS / Overview / 390
DevOS / Overview / 1440
DevOS / Today / 390
DevOS / Projects / 1440
DevOS / Roadmap / 390
```

## Source of truth until then

- color and spacing tokens: `packages/ui/src/styles/tokens.css`;
- primitive behavior: `packages/ui/src/primitives/*`;
- navigation behavior: `packages/ui/src/navigation/*`;
- direction, icons and accessibility: `docs/DESIGN_SYSTEM.md`;
- implemented public composition: `apps/web/src/routes/index.tsx` and `apps/web/src/styles.css`.

Figma remains a review and handoff surface. It must not become the source of domain rules, authorization decisions, visibility state or persisted data.
