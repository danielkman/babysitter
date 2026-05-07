---
id: page:agent-generate-universal-agentic-stack-orientation
nodeKind: Page
title: "Universal Agentic Stack Orientation"
slug: "agent-generate/universal-agentic-stack/00-orientation"
articlePath: "wiki/agent-generate/universal-agentic-stack/00-orientation.md"
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
# Universal Agentic Stack Orientation

The stack is easiest to understand if you read it as four connected bands rather than 11 unrelated boxes.

## The four bands

| Band | Layers | What it answers |
|---|---|---|
| Model supply | 1-3 | What model exists, who serves it, and how requests reach it. |
| Agent system | 4-6 | How the agent thinks, what runtime hosts it, and what platform or extension system surrounds it. |
| Operating boundary | 7-9 | Where the agent works, where actions execute, and what policy constrains them. |
| Surface | 10-11 | What actions are exposed and how humans or systems experience the result. |

## Read top-down or bottom-up

- Read top-down when you start from the user experience and want to know what lower layers make it possible.
- Read bottom-up when you start from a model, provider, or runtime technology and want to know what larger product it can support.
- Read the middle first when you are evaluating an "agent framework" or "coding agent" claim. Most of those claims live mainly in Layers 4, 5, and 6.

## The five questions that keep the map honest

1. What is the model artifact itself?
2. Who serves it and through what protocol?
3. Where does the agent loop actually live?
4. Where do files, tools, and commands execute?
5. What surface exposes actions and results to people or downstream systems?

If two tools answer different questions, they belong to different layers even if marketing puts them under the same label.

## Common mistakes

- Treating a provider or gateway as if it were an agent core.
- Treating a runtime with tools as if it were the full platform.
- Treating installed skills or plugins as runtime details instead of platform concerns.
- Ignoring workspace, execution, and sandbox because they are less visible in demos.
- Assuming the UI layer explains the compute path. It usually does not.
