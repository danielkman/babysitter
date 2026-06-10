# Active knowledge — overview

Purpose: how the three active-layer subsystems (contextual functionalities, knowledge autoencoding, and mining/discovery/ingestion) fit together, and the single load-bearing rule that keeps them outside the convergence core — INV-A1 (microagents are clients, never the substrate).

Source: SPEC §5b intro (1871-1890).

---

## What the active layer is

§§1–5 specify a **passive** substrate: facts go in, [`proj`](./22-git-substrate.md) folds them into a graph, and [retrieval](./26-retrieval.md) reads the fold. §5b adds an **active** layer — mechanisms adapted from the contextual-relation map of patent US9311402 (extracted and re-grounded in kip, not its wording). The active layer lets relations *carry computation*, lets the system *answer by traversal-and-execution*, and lets it *learn new graph structure* — all while leaving the convergence core ([§3.2 signature-only gate, §3.4 `proj`, §4b.4 SEC](./24-synchronization-and-convergence.md)) **byte-for-byte unchanged**.

The active layer adds **no new store**. It introduces only new *kinds of facts* the existing `proj` already knows how to fold (see the [data model](./21-data-model.md)).

## The three subsystems

```mermaid
flowchart TD
    subgraph active["Active layer (§5b) — all CLIENTS of the substrate"]
        CF["§5b.1 Contextual functionalities<br/>EdgeKinds carry microagents;<br/>ContextualQuery → Segment → dispatch"]
        AE["§5b.2 Knowledge autoencoding<br/>encode→decode→loss→learner loop;<br/>bounded budget; kip:learn fact"]
        MDI["§5b.3 Mining / discovery / ingestion<br/>Miner / Discoverer / Ingestor families;<br/>data-resource → objects → query → acquire"]
    end
    CF -->|"validated output"| ORCH
    AE -->|"accepted candidate"| ORCH
    MDI -->|"AcquisitionResult"| ORCH
    ORCH["Orchestrator<br/>(the ONLY author — §4.1/§6)"] -->|"signed assert / derived_from / kip:learn facts"| GATE["§3.2 signature-only ingest gate"]
    GATE --> PROJ["proj(factSet) — pure, deterministic fold"]
    PROJ --> GRAPH["typed property graph"]
```

The three subsystems are detailed in their own docs:

- **[Contextual-relation functionalities](./31-contextual-functionalities.md)** (§5b.1) — an `EdgeKind` MAY carry one or more microagent `FunctionalityBinding`s; a `ContextualQuery` compiles (pure read over `proj`) into a `Segment` dependency DAG, executes by ordered dispatch, and the results land as signed facts whose `derived_from` subgraph **is** the `AnswerGraph`.
- **[Knowledge autoencoding](./32-knowledge-autoencoding.md)** (§5b.2) — an autoencoder-shaped `encode → decode → reconstruction-loss → learner` loop under a **bounded disjunctive budget**, whose accepted output is recorded as a single signed `kip:learn` fact so replicas fold the result rather than re-running the loop.
- **[Mining, discovery & ingestion](./33-mining-discovery-ingestion.md)** (§5b.3) — Miner / Discoverer / Ingestor microagent families realizing the patent's `data-resource → objects-of-interest → query → acquire` pipeline, all emitting signed, source-provenanced facts.

The [SDK seams](./40-sdk-api-surface.md) that drive them — `registerFunctionality`, `runContextualQuery`, `runAcquisition`, and `learn` — are themselves thin clients in exactly this sense.

## INV-A1 — the single load-bearing rule

The whole section rests on one invariant:

> **INV-A1 (microagents are clients, never the substrate).** A microagent MUST NOT write to the graph. Every value it produces enters kip **only** as a signed, append-only fact authored by the orchestrator (§4.1, [§6](./40-sdk-api-surface.md)). The graph remains `proj(factSet)`; the active layer can change *what facts exist*, never *how facts fold*. A microagent that mutates state directly is non-conformant.

This is the Letta pitfall (N2) restated for executable relations: binding an executable to an edge tempts the executable to write the resulting edge/node itself. It MUST NOT. It returns a result; the orchestrator wraps that result as signed `assert` facts; the edge/node appears **only** via `proj`.

Two consequences flow from INV-A1 and recur throughout §5b:

- **No silent picks (N5).** Wherever the active layer faces a choice among realizers, segments, or learned results, it surfaces a **typed choice** (mirroring `kip:conflict`) rather than auto-collapsing to a winner.
- **Accelerator boundary ([§5.3](./26-retrieval.md)).** Non-deterministic, model-relative computation (encode/decode/loss/embedding/search) runs **outside** `proj`; only the *recorded* fact is substrate.

The active-layer conformance invariants **INV-A1**–**INV-A14** are catalogued as a test plan in [Conformance & testability](./60-conformance-and-testability.md). INV-A1 itself is asserted by running each active seam against a substrate harness whose only mutation primitive is `assertFact`, and checking that every state change is attributable to an orchestrator-signed fact.
