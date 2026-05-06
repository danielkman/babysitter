---
id: page:index
nodeKind: Page
title: "Wiki (Phase 4)"
slug: "index"
articlePath: "wiki/README.md"
documents: []
---
# Wiki (Phase 4)

The full encyclopedia of the v6 ecosystem, **derived from the graph**. Every page corresponds to a graph query; no page is hand-authored. If a fact appears on a wiki page, it appears in the graph first.

## Files in this directory

| Path | Purpose |
|---|---|
| [`00-wiki-architecture.md`](./00-wiki-architecture.md) | Site structure, navigation taxonomy, search, cross-refs, asset handling, generation cadence. |
| [`01-derivation-mapping.md`](./01-derivation-mapping.md) | Table mapping each wiki page type to the graph query that produces it. |
| `generated/` | Generator output land. Untracked content during dev; built by CI for publishing. |
| `assets/` | Static assets (logos, hand-drawn diagrams) — the only hand-authored material in the wiki. |

## Acceptance

- Every `Term`, `Product`, `Capability`, `Hook`, `Channel`, and `Stack-layer` in the graph has a page.
- Navigation produces no dead links.
- Search returns expected hits for the spot-check queries in `wiki/qa/00-qa-architecture.md`.
- A regeneration on the same graph snapshot produces a byte-identical site.
