# agent-browser — verify changes in a real browser

> **Status:** Assimilation research note (no code change beyond the atlas record).
> **Date:** 2026-06-23.
> **Tagline (requester):** "Verify changes in a real browser."
> **Method:** vendor homepage <https://agent-browser.dev> + npm/GitHub corroboration. Behavioral claims (command counts, integrations) are vendor-stated and not independently exercised.
> **Provenance (verified 2026-06-23):** open source, **Apache-2.0**, by **Vercel Labs** — `github.com/vercel-labs/agent-browser`, npm `agent-browser` (v0.29.1 at time of writing).
> **Atlas record:** `tool:agent-browser` — `packages/atlas/graph/domain/tools/agent-browser.yaml` (evidence `evidence:agent-browser-homepage-2026-06`, `evidence:agent-browser-npm-2026-06`).

---

## 0. Bottom line

A browser-automation CLI explicitly built for AI coding agents to **drive a real Chrome and verify their own changes**. Its differentiator vs. general automation frameworks is **token-efficient output**: it returns accessibility-tree snapshots with stable element handles (`@e1`, `@e2`) instead of raw DOM/screenshots, so an agent can select elements deterministically and cheaply. Native Rust, install via npm/brew.

## 1. What it does

Programmatic browser control from the shell, designed so an agent that can "run shell commands" can open pages, fill forms, click, screenshot, monitor network, inspect storage, record video, and diff — then read compact text back to decide its next step.

## 2. How it works

Client–daemon architecture, **100% native Rust**:

- A Rust CLI parses commands and talks to a long-lived Rust **daemon**.
- The daemon controls Chrome via the **Chrome DevTools Protocol (CDP)**.
- Snapshots are emitted as **accessibility trees** with element references (`@e1`, `@e2`) for deterministic selection (no brittle CSS/XPath).
- 50+ commands span navigation, forms, screenshots, network monitoring, storage, and debugging, plus video recording, streaming, profiling, and diffing. Session management preserves auth state; proxy support and React/Web-Vitals + Next.js monitoring are included.

## 3. Install & usage

```bash
npm install -g agent-browser      # all platforms
brew install agent-browser        # macOS
agent-browser install             # download Chrome
npx agent-browser open example.com
```

Cross-platform binaries (macOS / Linux / Windows).

## 4. Relevance to babysitter / agent workflows

- **Self-verification loop:** a natural "did my change actually render/behave" check an orchestrated coding agent can run before declaring a step done — complements the babysitter governance/quality-convergence loop.
- **Token-efficiency** aligns with the repo's recurring concern about concise agent I/O (cf. live-stack "concise prompt" stabilization work).
- Potential future surface: an `agent-browser`-backed verification step or a babysitter skill/tool descriptor. Not wired in yet — recorded here as catalog awareness.

## 5. Comparison (atlas edges)

`alternative_to`: `tool:playwright` (general framework vs. agent-first token-efficient CLI), `tool:dev-browser` (same problem space; native Rust, large command surface), `tool:browserbase` (hosted remote browser vs. local Rust daemon driving local Chrome).

## 6. Caveats / open questions

- License/OSS/repo **verified** (Apache-2.0, Vercel Labs) via npm + GitHub. Early version (0.29.x) — API surface may move.
- "50+ commands", token-efficiency gains, and provider integrations (AgentCore/Browserbase/Browserless) are vendor claims, not independently exercised here.
