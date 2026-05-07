---
id: page:agent-generate-universal-agentic-stack
nodeKind: Page
title: "Universal Agentic Stack"
slug: "agent-generate/universal-agentic-stack"
articlePath: "wiki/agent-generate/universal-agentic-stack/README.md"
documents:
  - "layer:1-model"
  - "layer:2-provider"
  - "layer:3-transport"
  - "layer:4-agent-core"
  - "layer:5-agent-runtime"
  - "layer:6-agent-platform"
  - "layer:7-workspace"
  - "layer:8-execution"
  - "layer:9-sandbox"
  - "layer:10-interaction"
  - "layer:11-presentation"
---
# Universal Agentic Stack

This section is the Atlas field guide to the 11-layer agentic stack. Use it to place products, frameworks, runtimes, plugins, and interfaces in the right part of the system instead of flattening everything into a vague "agent" bucket.

## Start with the page that matches your question

| Page | Best for |
|---|---|
| [`00-orientation.md`](./00-orientation.md) | Learning the layer groups and the basic reading model. |
| [`01-builder-fit.md`](./01-builder-fit.md) | Placing LangGraph, custom-agent builders, coding agents, and gateways correctly. |
| [`02-landscape-diagram.md`](./02-landscape-diagram.md) | Seeing the whole stack at once in one visual map. |
| [`03-placement-checklist.md`](./03-placement-checklist.md) | Classifying a real tool or product step by step. |
| [`layers.md`](./layers.md) | Reading the full layer-by-layer reference from the graph. |
| [`source-map.md`](./source-map.md) | Tracing every page claim back to the graph files that generated it. |

## What this section helps you do

- Separate the model itself from the provider that serves it and the transport that carries requests.
- Distinguish the agent core from the runtime around it and the platform above it.
- Place plugins, installed skills, subagents, tool servers, and extension systems in the right layer.
- Understand which layers a framework owns and which layers it delegates to an IDE, host app, CI runner, cloud platform, or user shell.

## Fast takeaways

- Most confusion comes from mixing Layers 4, 5, and 6: core, runtime, and platform are related but not the same thing.
- Many real products span multiple adjacent layers, but very few span the whole stack cleanly.
- Workspace, execution, and sandbox are operational layers, not just implementation details.
- Presentation and interaction are separate from the compute path: a great UI does not tell you where the agent logic really lives.
