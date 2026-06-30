# mcp-channels — Design & Architecture

> **Migration note (2026-06).** This is the original `mcp-channels` design record,
> preserved as-is. The package has since been **ported to TypeScript and published
> as [`@a5c-ai/channels-adapter`](../README.md)** inside the babysitter monorepo at
> `packages/adapters/channels`. Where this document says `mcp-channels`, read
> `@a5c-ai/channels-adapter`; the `src/*.js` modules referenced below are now
> `src/*.ts` compiled to `dist/` (the CLI ships as the `adapters-channels` bin, with
> `mcp-channels` kept as an alias). The framework also gained an additive built-in
> **`webhook`** backend (`src/backends/webhook.ts`, built on
> `@a5c-ai/triggers-adapter`'s `normalizeEvent`) alongside `github`/`jira` — see the
> README.

> Companion to `SPEC.md` (the authoritative contract). Where this document and
> `SPEC.md` ever disagree, **SPEC.md wins**. This file describes *how* the
> modules under `src/` realize that contract: the module map, the backend hook
> interface, the runtime data flow, the opaque `reply_to` routing token, and the
> per-backend changed-since / dedup strategy.

`mcp-channels` is a Node.js (ESM, no build step) MCP-server mini-framework. It
runs as a **stdio MCP server** that declares the `claude/channel` capability,
polls pluggable backends on a per-source schedule, computes what changed since
the last check, dedupes so each external event fires at most once, filters
events declaratively, emits each survivor as a `notifications/claude/channel`
event, and relays Claude's replies back to the origin via a `reply` MCP tool.

---

## 1. Module map (`src/`)

The framework is split into small, single-responsibility ESM modules. Arrows
below read "depends on / calls into".

```
                          ┌────────────┐
        argv ──────────▶  │  cli.js    │  (thin bootstrap, excluded from coverage)
                          └─────┬──────┘
                                │ createRuntime(configPath, deps)
                                ▼
                          ┌────────────┐      load + validate YAML
                          │ runtime.js │ ───────────────────────────▶ config.js
                          └─┬────┬───┬─┘
              build backends│    │   │ connect stdio transport
                 via        │    │   └───────────────▶ server.js (ChannelServer)
              registry.js   │    │                         │  emit(event)
                 ▲          │    │ start Poller            │  reply tool → relay.js
                 │          │    ▼                         ▼
          backends/*.js     │  poller.js ──┬─▶ state.js  (cursor + seen[])
          (github, jira)    │              ├─▶ filter.js (declarative matcher)
          custom .js        │              ├─▶ dedup.js  (deriveNew + cursor advance)
                            │              └─▶ backend.poll(ctx) (HTTP via injected http)
                            │
                            └─ index.js  (public exports / package surface)
```

| Module | Responsibility |
|--------|----------------|
| `src/index.js` | Public package surface. Re-exports `ChannelServer`, `createRuntime`, `defineBackend`, `registry`, the `filter` engine, the `StateStore`, and the JSDoc types. This is what library consumers `import`. |
| `src/server.js` (`ChannelServer`) | Wraps the MCP `Server`. Declares channel capabilities (`experimental['claude/channel']={}`, plus `tools={}` two-way and `experimental['claude/channel/permission']={}` when enabled). Registers the `reply` tool (`ListToolsRequestSchema` + `CallToolRequestSchema`). Exposes `emit(event)` → one `notifications/claude/channel`. Routes `reply` tool calls through `relay.js` to the owning backend. Optional permission relay. **Transport-injectable** so tests can capture notifications/tool calls. |
| `src/runtime.js` | Bootstrap/composition root. `createRuntime(configPath, deps)` → load+validate config (`config.js`), build backends (`registry.js`), construct the `ChannelServer`, wire the `Poller`. Returns `{ server, poller, start, stop }`. `start()` connects the stdio transport and starts polling; `stop()` tears both down. `deps` allows injecting a fake transport/clock/http for tests. |
| `src/config.js` | Loads YAML (`js-yaml`), performs `${ENV}` interpolation from `process.env`, applies defaults, normalizes into a typed config object, and **collects actionable validation errors** (missing required env, unknown backend, invalid filter shape, backend `validateConfig` failures) rather than throwing piecemeal. |
| `src/poller.js` (`Poller`) | Per-source interval scheduling. Each tick for a source: load state → `backend.poll(ctx)` → apply `filter` → `dedup` → persist state → `server.emit` for each survivor. **Injectable clock/timer**; exposes `tick(sourceId)` for deterministic, timer-free testing. |
| `src/state.js` (`StateStore`) | Persists `{ cursor, seen[] }` per source as JSON via **atomic write** (temp file + rename). Default dir `~/.claude/channels/<server>/state`, overridable by `state.dir`. Pluggable `get(sourceId)` / `set(sourceId, state)` interface. `seen` is **bounded** (`maxSeenPerSource`, FIFO prune). |
| `src/filter.js` | Declarative matcher engine over a **dot-path** payload. Leaf ops: `eq, ne, in, nin, includes, contains, regex, exists, gt, gte, lt, lte`. Combinators: `all`, `any`, `not`. `contains`/`regex` honor `ignoreCase`. Unknown op or bad path → **no match, never throws** (so a malformed filter can't crash a poll). |
| `src/dedup.js` | Shared dedup helpers: `deriveNew(items, { idOf, seen })` (drop items whose id is already seen) and cursor-advance helpers. Encapsulates the "no changed-since semantics → seen-set" fallback so every backend shares one implementation. |
| `src/registry.js` | Maps backend `type` → backend module. Built-ins `github`, `jira` are pre-registered. `register(type, backend)` adds a backend programmatically; `load(path)` dynamically imports a custom JS backend referenced from YAML (`backend: ./my-backend.js`), resolving the path relative to the config file. Validates the loaded module exposes the hook interface. |
| `src/relay.js` | Owns the opaque `reply_to` routing token: `encode(routing)` / `decode(token)`, and `dispatch({ routing, text })` which looks up the owning backend and calls `backend.reply(...)`. Keeps routing details out of Claude's hands (see §4). |
| `src/backends/github.js` | GitHub backend (poll + reply). See §5.1. |
| `src/backends/jira.js` | Jira backend (poll + reply). See §5.2. |
| `src/backend.js` | JSDoc `@typedef`s for the hook interface (`ChannelEvent`, `PollContext`, `PollResult`, `Backend`) + shared helpers, notably `defineBackend(obj)` (identity helper that gives editors the `Backend` type and can assert required hooks). |
| `src/types.d.ts` | Mirrors the JSDoc typedefs as ambient TypeScript for editor support. No runtime code. |

---

## 2. Backend hook interface (the extension points)

A **backend** is a plain JS module exporting a `Backend` object. The framework
never imports a real HTTP client into a backend; all network access goes through
the injected `http` so tests can supply a fake. The typedefs (mirrored in
`src/backend.js` / `types.d.ts`):

```js
/** @typedef {{ id:string, content:string, meta:Object<string,string>,
 *             payload:object, routing:object }} ChannelEvent */
/** @typedef {{ source:object, state:object, http:Function, log:Function,
 *             now:Date }} PollContext */
/** @typedef {{ events:ChannelEvent[], state:object }} PollResult */
/** @typedef {{
 *   type: string,
 *   validateConfig?: (source:object) => string[],
 *   init?: (source:object) => void|Promise<void>,
 *   poll: (ctx:PollContext) => Promise<PollResult>,
 *   reply: (a:{routing:object, text:string, source:object, http:Function})
 *            => Promise<{ ok:boolean, ref?:string }>
 * }} Backend */
```

### Hook signatures & contract

- **`type: string`** — stable identifier for the backend (used in logs and as
  the built-in registry key, e.g. `'github'`).

- **`validateConfig?(source) => string[]`** — *optional*, called at **config-load
  time**. Returns an array of human-readable problems (empty == valid). This is
  how a backend turns misconfiguration into a **validation error** instead of a
  crash at poll time (SPEC §5). `config.js` aggregates these with its own checks.

- **`init?(source) => void | Promise<void>`** — *optional*, called **once before
  the first poll** of that source. For warming caches or one-time setup. May be
  async.

- **`poll(ctx: PollContext) => Promise<PollResult>`** — *required*. The heart of a
  backend. Given `ctx = { source, state, http, log, now }`:
  - MUST be **pure w.r.t. side effects except HTTP via `ctx.http`** (so tests
    inject a fake transport).
  - MUST use `ctx.state.cursor` to request only **changes since last check**
    where the upstream API supports it.
  - MUST set **`routing` on every event** so a reply can reach origin.
  - Returns `{ events, state }`: the new `ChannelEvent[]` **and** the next state
    object (cursor + any backend-managed seen data) that the framework persists.
  - A backend MAY pre-filter at the API for efficiency, but **MUST NOT rely on
    it for correctness** — the core is the authoritative filter + dedup gate.

- **`reply({ routing, text, source, http }) => Promise<{ ok, ref? }>`** —
  *required*. Posts `text` back to the origin item identified by `routing`, using
  `source.auth` for credentials and the injected `http`. Returns `{ ok }` and an
  optional `ref` (e.g. the created comment's id/URL). The `ChannelServer` maps a
  falsy `ok` / a thrown error to a tool result with `isError: true`.

`src/backend.js` also exports **`defineBackend(obj)`** — an identity helper that
returns its argument typed as `Backend` (and may assert the required hooks are
present), giving custom-backend authors editor support without a build step.

---

## 3. Runtime data flow

### 3.1 Inbound: poll → filter → dedup → emit

For each source, on its scheduled tick (or a test's explicit `poller.tick(id)`):

```
              ┌──────────────────────────────────────────────────────────────┐
              │ Poller.tick(sourceId)                                         │
              └──────────────────────────────────────────────────────────────┘
                       │
 (1) load state        ▼
 StateStore.get(id) ─▶ { cursor, seen[] }
                       │
 (2) poll backend      ▼     ctx = { source, state, http, log, now }
 backend.poll(ctx) ─▶ { events:[ {id, content, meta, payload, routing}, … ],
                        state: { cursor', seen' } }   ← API queried with cursor
                       │
 (3) FILTER (core)     ▼     filter.match(source.filter, event.payload)
 keep events whose payload satisfies the declarative filter (all/any/not + ops)
                       │
 (4) DEDUP (core)      ▼     dedup.deriveNew(kept, { idOf: e=>e.id, seen })
 drop any event whose id is already in seen[]  → survivors[]
                       │
 (5) mint reply_to     ▼     relay.encode(event.routing) per survivor
 attach opaque token as event.meta.reply_to
                       │
 (6) persist state     ▼     StateStore.set(id, { cursor', seen ∪ survivor ids })
 cursor advances; seen[] grows (FIFO-bounded by maxSeenPerSource)
                       │
 (7) EMIT              ▼     for each survivor:
 server.emit({ content, meta }) ─▶ ONE notifications/claude/channel
```

Arrival to Claude:
`<channel source="<server name>" k="v" …>content</channel>`.

**Meta sanitization (SPEC §2):** `server.emit` sanitizes `meta` so only
identifier keys (`[A-Za-z0-9_]+`) survive — keys with hyphens/other characters
are silently dropped by Claude Code, so the framework validates them up front and
**routing never depends on a dropped key**. `source` is set by Claude Code from
the server name and is **never** placed in `meta` by the framework.

**Filter/dedup ordering.** Filtering happens **before** dedup so an event is only
"consumed" (recorded as seen) once it actually matters — a non-matching event is
simply ignored that tick. Dedup is the authoritative gate that guarantees
"at most once" even when polling windows overlap (see §5).

### 3.2 Outbound: reply tool → relay → backend.reply → origin comment

```
 Claude calls the `reply` tool
   args: { reply_to: "<opaque token>", text: "…" }
        │
        ▼
 ChannelServer (CallToolRequestSchema handler)
        │  relay.decode(reply_to) → { backendType / sourceId, routing }
        ▼
 relay.dispatch({ routing, text })
        │  look up owning backend + its source (for auth + http)
        ▼
 backend.reply({ routing, text, source, http })
        │  POST back to origin (GitHub issue/PR comment, or Jira issue comment)
        ▼
 { ok:true, ref } ──▶ tool result { content:[{type:'text', text:…}] }
 { ok:false }/throw ─▶ tool result { content:[…], isError:true }   (SPEC §2, AC-16)
```

The `reply` tool is the **only** way replies leave the system, and it always
funnels through `relay.js` → the owning `backend.reply`, so the origin POST shape
is owned entirely by the backend.

---

## 4. The opaque `reply_to` routing token

**Problem.** A reply must reach the *exact* origin (this repo, this issue number,
or this Jira key). But Claude only forwards a value back to us through one small
attribute, and inbound channel text is an untrusted prompt-injection surface
(SPEC §2 sender gating). We must not depend on Claude to faithfully reconstruct a
structured routing object, and we must not let model-authored text dictate where
a write goes.

**Design.** The framework mints a single **opaque routing token** per event and
exposes it as exactly one meta attribute: `meta.reply_to`. Claude treats it as a
black box — it simply echoes that one attribute back when calling the `reply`
tool. The framework alone interprets it.

- **What it encodes.** Everything needed to dispatch a reply to origin, and
  nothing Claude needs to understand:
  - the **owning source id** (so we recover `source.auth` + the right backend),
  - the **backend `type`** (so `relay.js` routes to the correct `reply`), and
  - the backend's **`routing`** object — the origin coordinates the backend set
    on the event, e.g. GitHub `{ owner, repo, issue_number }` or Jira `{ key }`.
- **Encoding.** `relay.encode(routing)` serializes that record (JSON) and wraps
  it in a compact, URL-safe, **opaque** form (e.g. base64url). It is a *routing*
  token, not a security token — it carries no secrets (auth lives only in the
  loaded config, keyed by source id) — but treating it as opaque keeps Claude
  from constructing or mutating routing targets.
- **Decoding.** `relay.decode(token)` reverses it. A malformed/garbled token
  (bad base64, bad JSON, unknown source/backend) yields a clean failure that the
  `reply` tool surfaces as `isError:true` **without throwing** (SPEC §6 AC-16).

**Why only one attribute.** Keeping routing in a single opaque token (a) means
Claude carries no structured routing logic and can't be steered into writing to
the wrong issue, (b) survives the meta-key sanitizer because `reply_to` is a
valid identifier, and (c) lets backends evolve their routing shape without
changing the channel contract or the tool schema.

---

## 5. Dedup / changed-since strategy (per backend)

Both backends use `state = { cursor, seen[] }`. The **cursor** narrows the API
query to "since last time"; the **seen-set** is the correctness backstop that
guarantees *at most once* even when the cursor's granularity causes overlapping
windows. The core always re-applies `dedup.deriveNew` regardless of backend.

### 5.1 GitHub — `since` cursor (timestamp), id-based dedup

- **issue_comment:**
  `GET /repos/{o}/{r}/issues/comments?sort=updated&direction=asc&since=<cursor>`.
  - **Cursor** = max `updated_at` observed → the next poll asks only for comments
    updated at/after that instant.
  - **Dedup id** = `gh:comment:<id>` by default → an **edit does not re-trigger**
    (the comment id is already in `seen`). If re-trigger-on-edit is configured,
    the id becomes `gh:comment:<id>:<updated_at>` so a new `updated_at` is treated
    as a fresh event (SPEC §4.1, AC-14).
  - Because `since` is inclusive and the boundary comment can reappear in the next
    window, the **seen-set** drops that already-emitted boundary item — no
    duplicate (AC-13).
  - Each comment resolves its parent issue/PR number from `issue_url`; the parent
    `issue` object is attached at `payload.issue` (one extra GET, cached) so
    filters like `issue.assignee.login` work.
- **issue_opened:**
  `GET /repos/{o}/{r}/issues?state=open&sort=created&direction=asc&since=<cursor>`,
  then **filter to `created_at > cursor`** (the API's `since` is `updated`-based,
  so we post-filter on creation). **Dedup id** = `gh:issue:<id>`. Cursor = max
  `created_at`.
- **meta:** `{ repo, issue_number, kind, author, reply_to }`.
- **reply:** `POST /repos/{o}/{r}/issues/{issue_number}/comments { body: text }`.

### 5.2 Jira — JQL `created >= cursor` + minute-granularity seen-set

- **Poll:** `POST /rest/api/3/search` with JQL
  `project = "<P>" AND created >= "<cursor>" ORDER BY created ASC`
  (or `updated >= …` for `issue_updated`), plus any `config.jql` extra clause.
- **Cursor** = max `created` (or `updated`) observed.
- **The catch:** Jira JQL datetime comparisons are **minute-granularity**. Two
  issues created in the same minute as the cursor would both re-match
  `created >= "<cursor>"` on the next poll. So the cursor **alone** cannot
  guarantee at-most-once.
- **Fix:** combine the cursor with a **seen-set keyed by `<key>:<created>`**
  (issue key + full timestamp). Re-matched same-minute issues are recognized as
  already-seen and dropped, so each Jira event triggers exactly once (SPEC §4.2,
  AC-13). The seen-set is FIFO-bounded by `maxSeenPerSource`.
- **payload** = the raw issue (`fields.labels`, `fields.summary`,
  `fields.project.key`, `fields.assignee.emailAddress`, …).
- **meta:** `{ project, issue_key, kind, reply_to }`.
- **reply:** `POST /rest/api/3/issue/{key}/comment` with an ADF body.

### 5.3 Shared invariants

- `dedup.deriveNew(items, { idOf, seen })` is the single chokepoint for "drop
  what we've already emitted"; backends only choose the **id derivation** and any
  cursor post-filter.
- `seen[]` is **bounded** (`maxSeenPerSource`, FIFO prune) so state files stay
  small; the cursor ensures the bounded window is sufficient (we never need to
  remember ids older than roughly one polling window past the cursor).
- A custom backend with **no** changed-since support at all can lean entirely on
  the seen-set fallback (see `examples/custom-backend.js`).

---

## 6. Testability hooks (why these seams exist)

The contract in SPEC §7 requires fully-offline tests. The design exposes the
necessary seams:

- **`ChannelServer` transport-injectable** → tests connect a capturing transport
  and assert the exact `notifications/claude/channel` params and `reply` tool I/O.
- **`Poller` injectable clock/timer + `tick(sourceId)`** → deterministic interval
  and cursor-advance assertions without real time.
- **`http` injected into `poll`/`reply`** → GitHub/Jira backends run against fake
  HTTP returning fixture payloads; tests assert request URLs/params (`since`/JQL),
  emitted events, dedup across two polls, and reply POST shape.
- **`StateStore` pluggable** → an in-memory store for poller/integration tests.
- **`createRuntime(configPath, deps)`** → the integration test boots the whole
  pipeline with a capturing transport + fake HTTP, drives one tick, asserts the
  channel notification, then invokes `reply` and asserts the origin POST.

Coverage is measured on `src/**` only (vitest v8 provider, ≥90% line threshold;
`src/cli.js` and `src/types.d.ts` excluded as trivial/no-runtime).

---

## 7. Event-triggered session spawner (R8)

> Realizes **SPEC §10** (R8 + AC-19..AC-26). This is a **brownfield, backward-
> compatible** extension: every change below is additive. A source that does not
> opt into spawning behaves exactly as before, the existing 171 tests keep
> passing, and `@a5c-ai/adapters` stays an **optionalDependency** that is never
> imported unless a real launch is requested.

### 7.0 What it adds, in one paragraph

A surviving event (post filter + dedup) can now **spawn a fresh agent session**
via `@a5c-ai/adapters` instead of — or in addition to — emitting into the current
session. The spawned session is **self-associated**: it is wired with *this* MCP
server (re-launched over stdio with the same config) and is handed the event
context **plus the same `reply_to` token**, so it can post back to the **same
origin** (the triggering PR/issue/Jira issue) by calling the `reply` tool. Three
seams make this work: a new **`SessionSpawner`** (+ pure `buildSpawnRunOptions`
helper), a **shared reply secret** so the child's `reply_to` decodes in a second
process, and **per-source action routing** (`onEvent: emit | spawn | both`) in the
poller.

### 7.1 Module map additions

| Module | Responsibility |
|--------|----------------|
| `src/spawner.js` (`SessionSpawner` + `buildSpawnRunOptions`) | Turn `(source, event)` into adapters `RunOptions` and call an **injected** client's `run(...)`. Bounded concurrency, error isolation, lazy optional-dep load. `buildSpawnRunOptions` is a **pure** function (no I/O, no client) so it is trivially unit-tested. |
| `src/relay.js` (extended) | `encodeReplyTo`/`decodeReplyTo` gain an **optional secret**; a new `createRelay(secret)` factory binds a secret to a relay instance. Module-level functions keep their **single-arg** signatures (delegating to a default per-process instance) so all existing call sites and tests are unchanged. |
| `src/config.js` (extended) | Parse + normalize `server.replySecret`, the global `spawn` defaults block, and per-source `onEvent` + `spawn` (merged over global). New validation for AC-25 (spawn configured but no launch path available). |
| `src/runtime.js` (extended) | Resolve the effective reply secret, build the bound relay, construct the `SessionSpawner` (lazy-loading adapters only when no client is injected), and pass `spawner` into the `Poller`. |
| `src/poller.js` (extended) | After filter + dedup, dispatch each survivor per the source's effective `onEvent`: `emit` → `server.emit`, `spawn` → `spawner.spawn`, `both` → both. |
| `src/index.js` (extended) | Additionally export `SessionSpawner`, `buildSpawnRunOptions`, and `createRelay`. |

The dependency arrows extend the §1 map only at the poller's right edge:

```
 poller.js ──┬─▶ state.js / filter.js / dedup.js / backend.poll   (unchanged)
             ├─▶ server.emit(event)            ← when onEvent ∈ {emit, both}
             └─▶ spawner.spawn(source, event)  ← when onEvent ∈ {spawn, both}
                      │ buildSpawnRunOptions(source, event, ctx)   (pure)
                      ▼
                 client.run(RunOptions)   ← injected adapters-like client
                      │   (real client lazy-loaded from @a5c-ai/adapters)
                      ▼
                 RunHandle / RunResult
```

### 7.2 `SessionSpawner`

```js
new SessionSpawner({
  client,                 // REQUIRED-at-use injected adapters-like client: { run(opts): RunHandle }
  resolveConfigPath,      // () => string  — absolute path to THIS config (for the self-MCP re-launch)
  replySecret,            // string|undefined — shared HMAC secret passed into the child env (when set)
  maxConcurrent = 4,      // bounded concurrency (SPEC §10.3 default)
  selfMcpName,            // default 'mcp-channels' (resolved per-spawn from effective spawn config)
  log = () => {},
})
```

- **`async spawn(source, event)`** — the only public method.
  1. Computes the source's **effective spawn config** (global `spawn` ⊕ per-source
     `spawn`, per-source wins; see §7.5 merge rules).
  2. Builds `RunOptions` via
     `buildSpawnRunOptions(source, event, { configPath: resolveConfigPath(), replySecret, spawn })`.
  3. Acquires a **concurrency slot** (see below), then calls `client.run(runOptions)`.
  4. Returns the launch outcome: `{ ok:true, handle }` on a successful `run(...)`,
     or `{ ok:false, error }` when the launch threw / the slot path failed. It
     **never throws** to the caller (the poller) — see error isolation.

- **Bounded concurrency (AC-24).** A tiny internal semaphore caps **in-flight
  launches** at `maxConcurrent` (default 4). The bound is on *starting* a run
  (the `client.run(...)` call + handle creation), which is the costly, rate-
  limited step; the slot is released as soon as the launch settles (the long-
  lived session then runs independently via its `RunHandle`). When the cap is
  reached, `spawn` awaits the next freed slot rather than rejecting — so a burst
  of survivors in one tick is throttled, not dropped. A `claude-code` session is
  itself long-running, so bounding *launch* fan-out (not lifetime) is the
  correct, testable knob and keeps the poller from issuing an unbounded spawn
  storm. The semaphore is a plain promise-queue (no timers), so tests assert the
  cap by making the fake client's `run` block on a deferred and observing that no
  more than `maxConcurrent` calls are outstanding.

- **Error isolation (AC-24).** Two failure surfaces are both contained: a
  **synchronous throw** from `client.run(...)` (e.g. bad options) and a
  **rejected await** (when the spawner awaits the launch). Both are caught,
  passed to `log` with the `source.id`, and converted to `{ ok:false, error }`.
  A spawn failure therefore **never crashes the poller, never blocks other
  events, and never rolls back dedup** — the event was already recorded as seen
  when it was dispatched (see §7.6 at-most-once stance). Note: per the adapters
  contract the `RunHandle`'s *thenable* "never rejects" (run-level errors surface
  in `RunResult.error`); the spawner does **not** await session completion (it
  returns the handle), so a long-running session that later errors does not
  concern the poller. Containment here is specifically about the **launch** step.

- **Optional-dep / lazy load.** `SessionSpawner` itself never imports
  `@a5c-ai/adapters`. The **runtime** decides the client (see §7.4): if `deps.client`
  is injected (tests, or an embedding app) it is used as-is; otherwise the runtime
  lazily `await import('@a5c-ai/adapters')`, calls `createClient()` **then**
  `registerBuiltInAdapters(client)` (the real arity-1 signature, which populates
  the client's registry so `agent:'claude'` resolves), and injects that client.
  Tests **always inject a fake**, so the suite is fully offline and the optional
  dependency is never loaded in CI.

### 7.3 `buildSpawnRunOptions(source, event, { configPath, replySecret, spawn })`

A **pure** function (its entire contract is its return value), which is why it is
the primary unit-test target. It maps the effective `spawn` config + the event
into an adapters `RunOptions` object (SPEC §10.2):

| RunOptions field | Source / rule |
|------------------|---------------|
| `agent` | effective `spawn.agent`, normalized via `normalizeAgentId` (default `claude`; the friendly alias `claude-code` maps to the canonical `claude` that the adapters registry resolves). |
| `prompt` | the default prompt (below), or the rendered per-source `promptTemplate`. |
| `nonInteractive` / `interactive` | **mode mapping (AC-19):** `mode:'headless'` → `nonInteractive:true`; `mode:'interactive'` → `interactive:true`. Exactly one is set; default mode is `headless`. |
| `model` | effective `spawn.model` when set (else omitted → adapter default). |
| `cwd` | effective `spawn.cwd`, **resolved to an absolute path** (RunOptions requires absolute) against `config.baseDir`; omitted when unset. |
| `approvalMode` | effective `spawn.approvalMode`, default **`yolo`** — see the security note. |
| `mcpServers` | `[ selfMcpServer ]` (the self-association entry, below). |
| `systemPrompt` | optional effective `spawn.systemPrompt` passthrough (else omitted). |
| `env` | effective `spawn.env` passthrough merged with nothing else here — the **reply secret travels on the self-MCP entry's `env`**, not the run-level `env` (the child only needs the secret in the spawned *MCP server* process). |

Only `agent` and `prompt` are ever guaranteed present; every optional field is
**omitted when unset** (never emitted as `undefined`) so the adapter's own
defaults/validation apply cleanly.

**The self `McpServerConfig` (self-association, AC-20).**

```js
{
  name: spawn.selfMcpName || 'mcp-channels',   // must match ^[a-zA-Z0-9_-]{1,64}$
  transport: 'stdio',
  command: 'node',
  args: [ <resolved absolute path to src/cli.js>, configPath ],
  env: replySecret ? { MCP_CHANNELS_REPLY_SECRET: replySecret } : {}
}
```

- The `args` **re-launch this very framework with the same config path**, so the
  child session gets a `mcp-channels` server exposing the **same `reply` tool**
  wired to the **same backends/auth** — that is what lets the spawned agent reply
  to the triggering origin.
- `src/cli.js` is resolved **absolutely** from `spawner.js` via
  `fileURLToPath(new URL('./cli.js', import.meta.url))` so the path is correct
  regardless of the child's `cwd` (Windows-safe; no reliance on `process.cwd()`).
- `env` carries the shared secret **only when set** (AC-20). Unset ⇒ `env:{}`,
  and the child falls back to its own per-process random key (the cross-process
  reply simply won't verify — see §7.4 / AC-21).
- `selfMcpName` is validated against the identifier regex at config time (§7.5)
  so an invalid name fails as a config error, not at spawn time.

**The default prompt (AC-23).** Built from the event so the spawned agent has
everything it needs to act and reply to origin. It includes, as plain text:

1. the event **`content`** (the triggering comment/issue/PR/Jira body),
2. the **routing-relevant meta** — whatever identifies origin for that backend
   (GitHub: `repo` + `issue_number`; Jira: `project` + `issue_key`) plus `kind`/
   `author` when present — rendered as `key: value` lines,
3. the **`source_id`** (for the agent's situational awareness / logs),
4. the **`reply_to` token verbatim**, and
5. an explicit **instruction**: *"To respond to the origin of this event, call the
   `reply` tool with `reply_to` set to the token above and your message as
   `text`. Echo the token exactly; do not modify it."*

The token surfaced to the spawned agent is the **same opaque, HMAC-signed
`reply_to`** the poller mints for the event (§7.6) — minted under the **shared
secret** so the child's `mcp-channels` (a different process) can decode it.

**`promptTemplate` override + placeholders (AC-23).** A per-source
`spawn.promptTemplate` string replaces the default prompt. Supported placeholders
(simple `{{…}}` substitution, **documented** so config authors can rely on them):

| Placeholder | Expands to |
|-------------|------------|
| `{{content}}` | `event.content` |
| `{{reply_to}}` | the minted `reply_to` token |
| `{{source_id}}` | the source's `id` |
| `{{meta.KEY}}` | `event.meta.KEY` (e.g. `{{meta.repo}}`, `{{meta.issue_number}}`, `{{meta.issue_key}}`) |

Substitution rules (kept deliberately boring so the template is predictable):
unknown `{{meta.X}}` (or a missing key) expands to the **empty string**;
placeholders are replaced literally (no expression evaluation) so untrusted event
text in `content`/`meta` can never inject a *new* placeholder or template logic.
The template author owns whether/where to include `{{reply_to}}` and the reply
instruction; the design recommends both in the docs.

### 7.4 Shared reply secret (AC-21)

The problem: `reply_to` is HMAC-signed with a **per-process random** secret
(DESIGN §4) so a token minted by process A cannot be verified by process B. That
is exactly right for the single-process model, but a **spawned child is a second
process** that must verify a token its parent minted. The fix is an **opt-in
shared secret**.

**Relay change (backward compatible).** `relay.js` gains a secret seam without
breaking its current single-arg API:

```js
// New factory: bind a secret to a relay instance.
export function createRelay(secret) { /* returns { encodeReplyTo, decodeReplyTo, dispatchReply } */ }

// Existing module-level fns gain an OPTIONAL trailing secret, defaulting to the
// module's per-process random key — so encodeReplyTo(record) / decodeReplyTo(token)
// keep working verbatim (existing tests + call sites unchanged).
export function encodeReplyTo(record, secret /* = REPLY_SECRET */) { … }
export function decodeReplyTo(token,  secret /* = REPLY_SECRET */) { … }
```

- When a **secret is provided** (a non-empty string), the HMAC key is **derived
  from it** (e.g. `createHash('sha256').update(secret).digest()` → a 32-byte key),
  so two processes constructed with the **same** secret produce identical
  signatures and round-trip each other's tokens.
- When **no secret is provided**, behavior is **identical to today**: the
  module's `REPLY_SECRET = randomBytes(32)` per-process key is used, a token from
  another process fails verification, `decodeReplyTo` returns `null`, and the
  `reply` tool surfaces `isError:true`. **Backward compatibility is total** —
  this is the default path for every existing test and every config that omits
  `server.replySecret`.

**Where the secret comes from.** `runtime.js` resolves the effective secret as
`config.server.replySecret ?? process.env.MCP_CHANNELS_REPLY_SECRET ?? undefined`
(config wins; env is the fallback). When set, the runtime:
1. builds a **bound relay** (`createRelay(secret)`) and uses *its*
   `encodeReplyTo`/`dispatchReply` for **both** the poller's minting path **and**
   the `reply`-tool decode path, so the running instance signs *and* verifies with
   the shared key (a child sharing the secret therefore interoperates both
   directions); and
2. passes the **same secret** into the `SessionSpawner` so it lands in the child
   self-MCP entry's `env` (§7.3). The child runtime, started from the same config
   (and the env var), independently derives the same key — closing the loop.

When unset, the runtime keeps using the module-level relay functions (per-process
random key) exactly as today, and the spawner emits `env:{}` for the self entry.

> **Security note.** Unlike auth (which lives only in the loaded config, keyed by
> source id), the reply secret **does** cross a process boundary (into the child's
> env). It is still **not a bearer credential** — it only authorizes *routing*
> (which origin a reply targets), never carries upstream tokens — but because a
> holder of the secret could mint a token for any origin a source can reach, it
> should be treated as sensitive: provided via `${MCP_CHANNELS_REPLY_SECRET}` (not
> committed), and only set when cross-process replies are actually needed.

### 7.5 Configuration additions (parse, defaults, merge, validation)

`config.js` is extended additively; all new keys are optional and absent keys
preserve today's behavior.

**`server.replySecret`** — optional string (typically `${MCP_CHANNELS_REPLY_SECRET}`).
Normalized onto `config.server.replySecret`. Empty/unset ⇒ omitted (per-process
random key path).

**Global `spawn` defaults block** — normalized onto `config.spawn` with defaults:

```
spawn:
  agent:        claude-code
  mode:         headless          # headless | interactive   (default headless)
  approvalMode: yolo              # yolo | prompt | deny      (default yolo)
  selfMcpName:  mcp-channels
  maxConcurrent: 4
  # optional passthroughs: model, cwd, systemPrompt, env, promptTemplate
```

**Per-source `onEvent` + `spawn`** — normalized onto each source:

- `source.onEvent`: one of `emit | spawn | both`, **default `emit`** (so existing
  configs — which have no `onEvent` — keep emitting and never spawn). An unknown
  value is a **validation error**.
- `source.spawn`: a partial block **merged over** the global `spawn`
  (shallow-merge at the key level; per-source value wins; `env` may be deep-merged
  so a source can add one variable without redefining the block). The merged
  result is what `SessionSpawner`/`buildSpawnRunOptions` read as the *effective*
  spawn config.

**Validation (collected into `errors[]`, never thrown — matches §config style):**

- `server.replySecret`, if present, must be a string.
- global `spawn.mode` / per-source effective `mode` ∈ {`headless`,`interactive`}.
- effective `approvalMode` ∈ {`yolo`,`prompt`,`deny`}.
- effective `selfMcpName` matches `^[a-zA-Z0-9_-]{1,64}$` (so the child
  `McpServerConfig` is valid by construction).
- `maxConcurrent`, if present, is a positive integer.
- `source.onEvent` ∈ {`emit`,`spawn`,`both`}.
- `promptTemplate`, if present, is a string.
- **AC-25 (optional-dep safety).** If **any** source has effective
  `onEvent ∈ {spawn, both}` **and** no client is injected **and**
  `@a5c-ai/adapters` cannot be resolved, surface a **clear config-validation /
  startup error** — e.g. *"Source 'gh-triage' is configured to spawn sessions but
  '@a5c-ai/adapters' is not installed and no client was injected; install it or
  inject a client."* This is checked at **startup** (`createRuntime`, where the
  injected-client/dep availability is known), **not at event time**, so a
  misconfigured spawn fails fast and loudly rather than crashing on the first
  matching event. The probe is a guarded `import.meta.resolve` / lazy
  `await import` that does **not** actually load the dep when a client is injected
  (tests inject a fake → no resolution attempt → stays offline).

### 7.6 Poller action routing + at-most-once stance (AC-22, AC-24)

The poller's inbound pipeline (DESIGN §3.1 steps 1–6) is **unchanged** through
filter → dedup → mint `reply_to` → persist state. Only the final **dispatch**
step (formerly "emit each survivor") becomes **action-routed**:

```
 for each survivor (after filter + dedup, with reply_to minted):
   action = source.onEvent            // emit | spawn | both  (default emit)
   if action includes 'emit'  → await server.emit({ content, meta:{…, reply_to} })
   if action includes 'spawn' → void  spawner.spawn(source, event-with-reply_to)
```

- **AC-22 routing.** `emit` ⇒ only `server.emit` (today's behavior, the default);
  `spawn` ⇒ only `spawner.spawn`, **never** emits; `both` ⇒ emits **and** spawns.
- The **`reply_to` minted for the event is shared** between the emitted meta and
  the spawned prompt, so whichever path (or both) carries the *same* origin token.
  Under a configured shared secret it is minted by the **bound relay**, so the
  child can decode it.
- **Spawn is dispatched but not awaited to completion.** The poller `void`s the
  `spawner.spawn(...)` promise (the spawner internally bounds/queues and isolates
  errors), so a slow or failing launch **does not** stall the tick, block sibling
  events, or hold the per-source serialization lock. The spawner's own
  concurrency cap (not the poller) governs launch fan-out.

- **At-most-once / seen semantics (AC-24).** An event is **recorded as seen when
  it is dispatched** (the existing `StateStore.set(...)` in step 6, *before* the
  dispatch loop), identically for `emit`, `spawn`, and `both`. The framework's
  guarantee remains **at-most-once**: a spawn launch failure is **not** rolled
  back into `seen`, so the framework will **not** re-spawn that event on the next
  poll. This is the deliberate stance for an autonomous side effect — a failed
  *launch* is logged for operator follow-up rather than silently retried, which
  would risk **duplicate** autonomous sessions (and duplicate origin replies) on
  every subsequent poll. (Symmetry with `emit`: a failed `server.emit` is likewise
  not un-seen.) The "isolation" half of AC-24 is the §7.2 error containment; the
  "doesn't advance/rollback dedup incorrectly" half is precisely this:
  dedup advances **once**, on dispatch, regardless of launch outcome.

### 7.7 Live-spawning prerequisites & test strategy

**Live spawning is out of scope for the automated suite** — exactly like running
a live Claude Code session (SPEC §1 non-goals). A real spawn needs the
`claude-code` CLI installed, `@a5c-ai/adapters` present, and valid agent auth —
none of which exist in CI. Therefore:

- Tests **inject a fake client** whose `run(opts)` records the call and returns a
  stub handle. `spawner.test.js` asserts the **call shape** (AC-19/20/22/23/24/25):
  `run` called exactly once per spawn; `agent`; `prompt` contains `reply_to` +
  `content` + routing meta; `mcpServers[0]` is the self entry (name, `stdio`,
  `command:'node'`, `args` ending in `cli.js` + the config path, `env` secret when
  set); mode→`nonInteractive`/`interactive` mapping; action routing; bounded
  concurrency (deferred `run`); error isolation (a throwing/rejecting `run`);
  and the missing-client/dep error.
- `buildSpawnRunOptions` is unit-tested **directly** (pure function, no client) —
  the cheapest, most stable assertions for the option mapping + prompt building.
- `relay.test.js` extends with the **cross-process** case (AC-21): two
  `createRelay(secret)` instances with the **same** secret round-trip a token;
  different (or random/unset) secrets fail to verify (`decodeReplyTo → null`).
- `config.test.js` / `poller.test.js` extend with `onEvent` + `spawn`
  parsing/merge and emit/spawn/both dispatch (the poller test injects a fake
  `spawner` recording `spawn(source,event)` calls).
- The README documents the `onEvent`/`spawn` config, the shared reply secret, and
  these live prerequisites.

**CI (AC-26).** `.github/workflows/ci.yml` already runs `npm ci` +
`npm run test:coverage` on push/PR to `main` across **Node 20 + 22** (and, beyond
the AC, both `ubuntu-latest` and `windows-latest`), so AC-26 is satisfied with
no code change — only the new spawner/relay/config tests are added to the
existing suite, and the ≥90%-lines gate on `src/**` is preserved (`spawner.js` is
covered by `spawner.test.js`; the lazy `@a5c-ai/adapters` import branch is the one
real-launch path excluded from line coverage as environment-gated, mirroring the
existing `cli.js` exclusion).
