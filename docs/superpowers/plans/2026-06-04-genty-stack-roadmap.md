# Genty Stack Roadmap

> The genty stack is a superset of Pi's capabilities plus trust enforcement.
> Baseline: [pi.dev](https://pi.dev/) as of 2026-06-04

---

## Stack Layer Reference

| Layer | Abstract Role | Our Implementation |
|-------|--------------|-------------------|
| L4 agent-core | Core runtime primitives | `@a5c-ai/genty-core` |
| L5 agent-runtime | Session/daemon/resource management | `@a5c-ai/genty-runtime` |
| L6 agent-platform | Orchestration, harness, governance | `@a5c-ai/genty-platform` |
| SDK | Public API surface | `@a5c-ai/babysitter-sdk` |
| Adapters | Harness integration | `@a5c-ai/adapters` family |

---

## 1. Modes of Operation

### 1.1 Interactive Mode — IMPLEMENTED

Full TUI via `@a5c-ai/genty-tui` (Ink). Harness orchestration via genty-platform. Real-time event rendering, breakpoint approval, parallel task visualization.

### 1.2 Print / JSON Mode — PARTIAL

**What Pi has:** `pi -p "query"` for one-shot execution. `--mode json` for structured event streams.

**What we have:** `genty tui --json` as a non-interactive fallback. No dedicated one-shot print mode.

**Gap:**
- Add `genty -p "query"` — run a single prompt, print result, exit
- Add `--mode json` — emit structured JSONL event stream to stdout
- Both should work without TUI dependencies

**Where:** `@a5c-ai/genty` (CLI package)

### 1.3 RPC Mode — GAP

**What Pi has:** JSON protocol over stdin/stdout for non-Node integrations.

**What we have:** MCP server mode over stdio (MCP protocol, not general-purpose RPC).

**Gap:**
- Implement a JSON-RPC or JSONL protocol over stdin/stdout
- Enable Python, Go, Rust clients to drive genty without Node.js
- Document the protocol in `docs/rpc.md`

**Where:** `@a5c-ai/genty-runtime` (protocol definition) + `@a5c-ai/genty` (CLI entry `genty rpc`)

### 1.4 SDK Mode — IMPLEMENTED

`@a5c-ai/babysitter-sdk` provides `defineTask`, run management, sessions, hooks. Programmatic embedding works.

---

## 2. Context Engineering

### 2.1 AGENTS.md — PARTIAL

**What Pi has:** Project instructions from `~/.pi/agent/`, parent directories, and CWD. Hierarchical merge.

**What we have:** Harness-specific loading (CLAUDE.md, AGENTS.md). Not natively unified in genty.

**Gap:** Genty should natively load `AGENTS.md` from `~/.genty/agent/`, parent dirs, and CWD — independent of harness.

**Where:** `@a5c-ai/genty-platform`

### 2.2 SYSTEM.md — GAP

**What Pi has:** Per-project `SYSTEM.md` that replaces or appends to the default system prompt.

**Gap:** Load `SYSTEM.md` from project root. Support replace and append modes.

**Where:** `@a5c-ai/genty-platform`

### 2.3 Compaction — IMPLEMENTED

4-layer compression subsystem (29%–94% reduction). Auto-summarizes at context limit. Customizable per-layer.

### 2.4 Skills — IMPLEMENTED

Skills with `SKILL.md`, progressive disclosure, on-demand loading. Unified plugin system with marketplace.

### 2.5 Prompt Templates — IMPLEMENTED

Commands as markdown files. `/name` expansion. Frontmatter metadata.

### 2.6 Dynamic Context — PARTIAL

**What Pi has:** Extensions inject messages per-turn, filter history, implement RAG, build long-term memory.

**What we have:** Hooks inject context at sessionStart/userPromptSubmit. No history filtering or built-in RAG.

**Gap:**
- `preTurn` extension point: inject messages before each model call
- `historyFilter` extension point: transform/filter message history
- RAG pipeline and long-term memory extension points

**Where:** `@a5c-ai/genty-platform`

---

## 3. Extensibility

### 3.1 Extension API — GAP (Critical)

**What Pi has:** TypeScript modules registering tools, commands, keyboard shortcuts, event listeners, TUI components. 50+ community extensions.

**What we have:** Plugin system with skills, hooks, MCP, commands — but no in-process TypeScript Extension API.

**Gap — biggest architectural delta:**
- Extension API contract (`GentyExtension` interface with `activate(ctx)`)
- ExtensionContext: registerTool, registerCommand, registerKeyBinding, onEvent, registerStatusBarItem, injectContext
- Discovery from `~/.genty/extensions/`, project `.genty/extensions/`, npm packages
- Extension lifecycle + sandboxing

**Where:**
- API types: `@a5c-ai/genty-core`
- Discovery + lifecycle: `@a5c-ai/genty-platform`
- TUI integration: `@a5c-ai/genty-tui`

### 3.2 Plugins — IMPLEMENTED

Full plugin system: skills, MCP servers, hooks, commands. Marketplace CLI. Per-harness bundles.

### 3.3 Hooks — IMPLEMENTED

Lifecycle hooks with 13 per-harness adapters.

### 3.4 MCP — IMPLEMENTED

MCP server mode + client for plugin tool servers.

### 3.5 Installable Extension Packages — PARTIAL

**Gap:** `genty install npm:@foo/genty-extension` for npm/git/local installation.

**Where:** `@a5c-ai/genty-platform`

---

## 4. Session Management

### 4.1 Tree-Structured History — GAP

**What Pi has:** Sessions as trees. `/tree` navigates. Branch from any message. Single-file multi-branch storage. Bookmarks, filters.

**What we have:** Linear event-sourced journal. Full replay/resume, no branching.

**Gap:**
- Tree data structure (parent pointers, branch IDs)
- `/tree` visual navigator
- Fork from any message
- Bookmarks and message-type filters

**Where:** `@a5c-ai/genty-runtime` + `@a5c-ai/genty-tui`

### 4.2 Session Export / Share — GAP

**What Pi has:** `/export` (HTML), `/share` (GitHub gist with shareable URL).

**Gap:** HTML export and gist upload with rendered view.

**Where:** `@a5c-ai/genty-runtime` + `@a5c-ai/genty`

### 4.3 Session Resume — IMPLEMENTED

Event-sourced journal with deterministic replay. Works across sessions and harnesses.

---

## 5. Model & Provider Support

### 5.1 Multi-Provider — IMPLEMENTED

15+ harnesses with provider routing via transport-adapter proxy.

### 5.2 Mid-Session Model Switch — PARTIAL

**Gap:** `/model` command + `Ctrl+P` favorite cycling.

**Where:** `@a5c-ai/genty-platform` + `@a5c-ai/genty-tui`

---

## 6. Agent Interaction

### 6.1 Steering — GAP

**What Pi has:** Messages during execution. Enter = steer, Alt+Enter = follow-up.

**Gap:** Steering queue, TUI input during execution, visual indicators.

**Where:** `@a5c-ai/genty-platform` + `@a5c-ai/genty-tui`

### 6.2 Approval Modes — IMPLEMENTED

Interactive (breakpoints) and yolo (auto-approve). Profile-driven density.

---

## 7. Trust Enforcement — GAP (New, beyond Pi)

This is where the genty stack goes beyond Pi. Every action in the system produces cryptographically signed evidence. Trust is not assumed — it is proven.

### 7.1 Design Principles

1. **Everything is signed.** Every tool result, model response, agent request, permission grant, and user prompt carries a cryptographic signature.
2. **Signatures chain.** A tool result signature covers the request that invoked it. A model response signature covers the messages that produced it. The chain is auditable end-to-end.
3. **Permissions are evidence-based.** Granting a permission produces a signed artifact. Consuming that permission requires presenting the signed evidence. No implicit trust.
4. **Subtasks and subagents inherit and extend the chain.** A delegated task carries the parent's signed request. The child's result is signed and linked back.

### 7.2 Tool Call Signing

Every tool call produces signed evidence:

- **Tool results are always signed.** The tool (Bash, Read, Write, MCP, etc.) signs its output with the tool's identity key. The signature covers: tool name, input parameters, output, timestamp, and the requesting agent's signed request.
- **Gateway tools (integrations with external systems) forward signatures.** When a tool calls an external API, it includes the upstream signature in its own signed result. This creates a provenance chain from external system → tool → agent.
- **Subtasks (via tasks-adapter) carry signed delegation.** The parent agent's signed request is included in the subtask input. The subtask result is signed by the executing agent and includes the delegation signature.
- **Subagents sign their results.** When an agent delegates to a subagent, the subagent's response carries its own signature plus the parent's delegation signature.
- **Breakpoints produce signed approval evidence.** When a human approves a breakpoint, the approval is signed with the approver's identity. The signed approval is verifiable independently.
- **tools-adapter signs dispatched tool calls.** The adapter that routes tool calls signs the dispatch, creating an auditable record of which adapter routed which call.

**Where:** `@a5c-ai/genty-core` (signing primitives) + `@a5c-ai/tools-adapter` + `@a5c-ai/tasks-adapter` + `@a5c-ai/babysitter-sdk` (breakpoints)

### 7.3 Model Response Signing

- **Models always sign responses.** The model adapter wraps the raw LLM response with a signature covering: model ID, provider, input messages hash, output content, token usage, timestamp.
- **The signature is attached to the response event** in the event stream, making it auditable from the journal.
- **Thinking/reasoning blocks are included** in the signed content — the signature proves what the model actually considered.

**Where:** `@a5c-ai/adapters-codecs` (per-harness response signing) + `@a5c-ai/comm-adapter` (signed event types)

### 7.4 Agent Request Signing

- **Agents sign every request** to tools and models. The signature covers: agent identity, session ID, turn number, request content, timestamp.
- **This enables attribution.** Any tool result or model response can be traced back to exactly which agent requested it, in which session, at which turn.
- **In multi-agent scenarios**, each agent has its own identity key. The delegation chain is fully signed.

**Where:** `@a5c-ai/genty-platform` (agent identity + request signing) + `@a5c-ai/genty-core` (identity primitives)

### 7.5 Permission as Signed Evidence

- **Permission/approval requests are tool calls.** The `approve` action is modeled as a tool invocation with a signed result.
- **Permissions granted produce signed artifacts.** The artifact includes: what was approved, who approved it, when, and under what conditions (scope, expiry).
- **Consuming a permission requires presenting the signed evidence.** For example, a file-system tool requiring deletion permission checks for a signed approval artifact covering that specific file path. No approval artifact = no deletion.
- **Approval artifacts can be scoped and time-limited.** "Delete files in /tmp/ for the next 5 minutes" produces a scoped signed artifact that the file-system tool validates on each call.
- **Yolo mode produces a blanket signed approval** at session start, but it's still a signed artifact — auditable and revocable.

**Where:** `@a5c-ai/babysitter-sdk` (approval signing + verification) + `@a5c-ai/genty-platform` (permission lifecycle) + individual tool implementations

### 7.6 Prompt Signing

- **The initial prompt is signed** by the user's identity (or the CI trigger's identity in automation). This establishes the chain of authority.
- **Follow-up messages are also signed.** Each user message carries a signature proving who sent it and when.
- **In steering scenarios**, steered messages carry the steerer's signature, distinguishing them from the original prompt author.
- **AGENTS.md and SYSTEM.md content is hashed and recorded** in the session, so the instructions that governed a run are provably known.

**Where:** `@a5c-ai/genty-platform` (prompt capture + signing) + `@a5c-ai/genty-runtime` (session identity)

### 7.7 Trust Chain Verification

The end-to-end chain:

```
User prompt (signed by user)
  → Agent request to model (signed by agent, includes prompt signature)
    → Model response (signed by model adapter, includes request hash)
      → Agent request to tool (signed by agent, includes model response hash)
        → Tool result (signed by tool, includes agent request signature)
          → Subtask delegation (signed by parent, includes tool result context)
            → Subtask result (signed by child agent, includes delegation signature)
              → Breakpoint approval (signed by human approver)
                → Final output (signed by agent, references full chain)
```

Any link in the chain can be independently verified. A missing or invalid signature breaks the chain and is flagged.

**Where:** `@a5c-ai/genty-core` (chain validation) + `@a5c-ai/babysitter-sdk` (journal verification)

---

## Priority Order

Based on architectural impact and user value:

1. **Trust Enforcement** — foundational security primitive, differentiator
2. **Extension API** — enables community-driven growth
3. **Print/JSON mode** — unblocks CI/CD and scripting
4. **RPC mode** — unblocks non-Node integrations
5. **AGENTS.md / SYSTEM.md** — context engineering fundamentals
6. **Tree-structured history** — non-linear exploration
7. **Steering** — real-time interaction during execution
8. **Mid-session model switch** — workflow flexibility
9. **Session export/share** — collaboration
10. **Dynamic context extensions** — RAG, memory, history filtering
11. **Installable extension packages** — ecosystem growth
