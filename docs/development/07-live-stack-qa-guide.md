# 07 — Live Stack QA Guide

## Overview

The live-stack workflow validates end-to-end harness compatibility by running real agent/model combinations through the transport-mux proxy. Each scenario installs a harness adapter, configures a model provider, and executes a babysitter process to confirm that the full pipeline — from agent CLI through transport-mux translation to model API and back — works correctly.

These tests catch integration regressions that unit tests and mocked pipelines cannot: mismatched streaming formats, incorrect provider translations, broken harness adapters, and transport-mux proxy routing failures.

## Push Defaults

Every push to `staging` or `main` automatically runs the following matrix:

| Agent | Model | Modes | Install |
|-------|-------|-------|---------|
| Claude Code | foundry-gpt55 | NI + bridged-interactive | vanilla |
| Codex | google-gemini31 | NI + bridged-interactive | vanilla |
| Pi | foundry-Kimi-K2.6 | NI + bridged-interactive | vanilla |
| Claude Code | (default) | interactive + bridged-hooks | bp |
| Codex | (default) | interactive + bridged-hooks | bp |

The first three rows test harness adapters against different model providers. The last two rows (BP install) verify the babysitter-plugin integration with interactive and bridged-hooks modes.

## When to Run Manual Dispatch

Trigger a manual dispatch in the following situations:

- **After adding a new harness adapter** — run the new agent against at least one model/mode combination to confirm it integrates correctly.
- **After changing transport-mux proxy logic** — run a broad sweep to verify no existing translations broke.
- **After modifying provider translations** — target the affected provider across multiple agents.
- **Before releases (full matrix)** — run all agents against all providers to establish a complete compatibility baseline.
- **When investigating a specific harness failure** — isolate the failing combination for faster iteration.

## How to Dispatch

1. Go to **Actions** in the repository.
2. Select the **Live Stack** workflow.
3. Click **Run workflow**.
4. Paste a JSON array into the **matrix** input field.

Each entry in the array defines one scenario:

```json
[
  {
    "agent": "<name>",
    "model": "<model-id>",
    "mode": "<mode>",
    "install": "<vanilla|bp>",
    "live": true,
    "process_mode": "<predefined|create>"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `agent` | yes | Harness adapter name (see Available Axes below) |
| `model` | yes | Model provider and identifier |
| `mode` | yes | Interaction mode |
| `install` | yes | `vanilla` for agent-mux only, `bp` for babysitter-plugin |
| `live` | yes | `true` for real model calls, `false` for mock/dry-run |
| `process_mode` | bp only | `predefined` or `create` |

## Available Axes

### Agents

`claude`, `codex`, `pi`, `gemini`, `copilot`, `hermes`, `cursor`, `opencode`, `openclaw`, `omp`, `droid`, `amp`

### Models

`foundry-gpt55`, `google-gemini31`, `anthropic-sonnet46`, `foundry-kimi`

### Modes

| Mode | Description |
|------|-------------|
| `ni` | Non-interactive — agent runs to completion with no user input |
| `bridged-interactive` | Interactive prompts bridged through transport-mux |
| `interactive` | Native interactive mode (BP install only) |
| `bridged-hooks` | Hook events bridged through transport-mux (BP install only) |

### Install

| Value | Description |
|-------|-------------|
| `vanilla` | Installs agent-mux only; tests raw harness adapter compatibility |
| `bp` | Installs babysitter-plugin; tests full plugin integration |

### Process Mode (BP only)

| Value | Description |
|-------|-------------|
| `predefined` | Uses an existing process definition |
| `create` | Creates a new process definition during the run |

### Live

| Value | Description |
|-------|-------------|
| `true` | Makes real model API calls through the provider |
| `false` | Mock/dry-run mode for testing pipeline mechanics without API costs |

## Common Dispatch Examples

### Test a single harness

Run one agent against one model in non-interactive mode:

```json
[{"agent":"hermes","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true}]
```

### Full harness sweep

Run all agents against foundry to validate every adapter:

```json
[
  {"agent":"claude","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"codex","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"pi","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"gemini","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"copilot","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"hermes","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"cursor","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"opencode","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"openclaw","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"omp","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"droid","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true},
  {"agent":"amp","model":"foundry-gpt55","mode":"ni","install":"vanilla","live":true}
]
```

### Anthropic direct

Test Claude Code against the Anthropic provider directly (bypasses foundry):

```json
[{"agent":"claude","model":"anthropic-sonnet46","mode":"ni","install":"vanilla","live":true}]
```

### BP create mode

Test babysitter-plugin with on-the-fly process creation:

```json
[{"agent":"claude","model":"foundry-gpt55","mode":"interactive","install":"bp","live":true,"process_mode":"create"}]
```

## Reading Results

The **Live Stack Report** job runs after all scenarios complete. It generates a summary table with the following columns:

| Column | Description |
|--------|-------------|
| Agent | Harness adapter used |
| Provider | Model provider |
| Model | Model identifier |
| Mode | Interaction mode |
| Runtime | Execution duration |
| Status | Pass/fail result |

Failed scenarios include expandable details with error logs, transport-mux traces, and the last agent output before failure. Look for these when triaging:

- **Transport errors** — usually indicate a proxy routing or translation issue.
- **Timeout failures** — may indicate a hung agent or unresponsive model endpoint.
- **Assertion failures** — the agent completed but produced unexpected output.

## Concurrency

- **Push runs** share a branch-based concurrency group with `cancel-in-progress` enabled. A new push to the same branch cancels any in-flight push run.
- **Dispatch runs** each receive a unique concurrency group. They are never cancelled by push runs or other dispatch runs.

This means you can safely dispatch a manual run while a push-triggered run is in progress — neither will interfere with the other.

## Known Limitations

- **Cursor requires `CURSOR_API_KEY`** — this secret is not provisioned in the default CI environment. Cursor scenarios will fail unless the key is added to the repository secrets.
- **Pi NI requires `--mode json` flag** — the Pi harness adapter must pass `--mode json` for non-interactive runs. This is handled automatically by the adapter, but be aware of it when debugging Pi NI failures.
- **Some harnesses install via pip/curl, not npm** — `hermes` and `cursor` (among others) are installed through pip or curl rather than npm. Their installation steps take longer and depend on external package registries outside the npm ecosystem.
