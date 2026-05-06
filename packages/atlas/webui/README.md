# Atlas Graph Explorer

A read-only Next.js app for browsing the Atlas catalog graph. Reusable graph data, indexing, and SDK access live in the workspace package `@a5c-ai/atlas`; this app consumes that package as `@a5c-ai/atlas-webui`.

## Features

- Home dashboard with stats + NodeKinds grouped by cluster
- `/kind/[nodeKind]` — list any NodeKind with auto-derived facets, sort, pagination
- `/n/[id]` — record detail with attribute table, outgoing/incoming edges, and a 1-hop mini-graph
- `/search` — full-text search (Fuse.js) over id / displayName / description / kind
- `/graph` — full graph canvas (react-flow) with depth 1–3 BFS, NodeKind/EdgeKind filtering
- `/wiki/[[...slug]]` — wiki-style graph pages backed by `Page` nodes and Markdown frontmatter
- `/edges` and `/edges/[edgeKind]` — EdgeKind catalog and per-kind wired pairs
- Dark mode by default; Tailwind v4 + hand-rolled shadcn-style primitives
- Keyboard shortcuts: `/` focuses search, `g h`/`g g`/`g e`/`g s` navigate, `?` shows help

## Run

```bash
npm install
npm run dev -w @a5c-ai/atlas-webui
# open http://localhost:3000
```

## Graph SDK and CLI

The `@a5c-ai/atlas` package owns the graph indexer, generated index, SDK helpers, CLI, and Markdown wiki page ingestion. The web app rebuilds that package automatically in `predev` and `prebuild`.

```bash
npm run build -w @a5c-ai/atlas
node packages/atlas/dist/cli.js stats
node packages/atlas/dist/cli.js search codex --limit 10
node packages/atlas/dist/cli.js neighbors <node-id> --depth 2
```

To build an index from another catalog directory:

```bash
node packages/atlas/dist/cli.js reindex --catalog-dir /path/to/graph --out /tmp/atlas-index.json
```

## Routes

| Route | Description |
| --- | --- |
| `/` | Home — stats + NodeKinds by cluster |
| `/kind/[nodeKind]` | List records of a NodeKind, faceted |
| `/n/[id]` | Record detail (Overview / JSON / Graph tabs) |
| `/search` | Fuzzy full-text search |
| `/graph?seed=<id>&depth=2` | Full graph canvas |
| `/wiki/[[...slug]]` | Wiki article backed by a `Page` graph node |
| `/edges` | EdgeKind catalog |
| `/edges/[edgeKind]` | Wired pairs for an EdgeKind |
| `/api/search-index.json` | Slim index for client-side search |
| `/api/graph-index.json` | Slim index for the graph canvas |

## Notes

- Trust Chain is OUT OF SCOPE in this app — Trust records render like any other NodeKind but no special UI is wired.
- IDs commonly contain `:` and `@`; routes URL-encode them.
- The SDK indexer is forgiving: current graph generation reports 11 parse errors across 2026 YAML files.
- Markdown articles live under `graph/wiki/**.md` with frontmatter. Each article is indexed as a `Page` node and can link to graph nodes with `documents`.

