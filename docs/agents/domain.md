# Domain Docs

This repo is configured as a **single-context** repo.

Engineering skills should consume this repo's domain documentation as follows.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** for architectural decision records that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, note it as a possible gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
