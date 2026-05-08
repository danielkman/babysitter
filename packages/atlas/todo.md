[ ] - agent ui frameworks
[ ] - llm proxy
[ ] - agent orchestration (sublayer of interaction)  - vibe-kanban, etc.
[ ] - cicd types, triggering abilities, etc.
[ ] - dispatches and remote dispatches
[ ] - more features and capabilities of the stack of cc-revex and oh-my-pi 
[ ] - populate memory systems, agentsh and other tools to the graph.
[ ] - testable claims for parts of the agentic ecosystem (tests that can be automated and run in the cicd), e.g. "claude code session lifecycle is X" -> smallest tests (with mocks) to validate or invalidate the claim, then add to the graph. (this will make regression testing and monitoring much easier - of external dependencies integrations) 
[ ] cicd for testable claims - process that runs the tests for the testable claims on a regular basis (e.g. daily) and reports any failures, so we can quickly identify when an external change has broken our assumptions and react accordingly.
[ ] - process that finds untested claims or assumptions in the graph and add "testable claims" to the graph, then prioritize them and add to the test suite. (this will make sure we have good coverage of the most important assumptions in our ecosystem)
[ ] - get rid of graph and schema backward compatability and get rid of process and wave related mentions in the graph. the graph shouldn't track the graph building process itself at all (waves, etc.) - besides defered nodes.
[ ] - defered nodes - nodes that are placeholders and represent a defered task to complete the graph. this will allow us to build the graph iteratively and in parallel, without having to wait for all the information to be available upfront. we can create defered nodes for parts of the graph that we haven't fully defined yet, and then fill them in later as we gather more information. and integrate this concepts with the processes designs in .a5c/processes/ and also create a new process there that detects defered tasks in the graph and replaces them with the actual nodes once the information is available.


https://dev.to/boucle2026/what-claude-code-hooks-can-and-cannot-enforce-148o
https://blakecrosley.com/guides/codex#hooks
https://blakecrosley.com/guides/claude-code

- guide generator (agentic) - from graph:
- course/kit/hub generator (agentic) - from graph:

meta:
sourcing for information
defered nodes (comments too)
scope and context
evidence, experiments. including scoping to what they prove and how it is scoped to the existing entities.
trust tiers on information
(have this in the ontology driven process, some of them as setup-process, including creating the validation script, scaffolding the tools, wiki, sdk, cli, and experiment generation, cicd, etc.)


https://blakecrosley.com/writing/taste-infrastructure


unify canonicalized_to edges nodes to compact the graph.


----
library - graph:

 Tier 2 — Schema evolution (the decision-making model)

  #: 5
  Item: Extend Responsibility with decision-making attributes — add responsibilityKind enum (operational, decision-making, advisory, oversight), ownershipAspect enum
    (security, compliance, quality, execution, architecture, budget, hiring, strategy, privacy, reliability), and decisionScope (ref to the entity whose decisions
  this
     responsibility governs)
  Details:
  ────────────────────────────────────────
  #: 6
  Item: New node kind: DecisionType — models the type/category of decision (e.g., decision-type:technology-selection, decision-type:architecture-choice,
    decision-type:vendor-selection, decision-type:hiring-decision, decision-type:budget-allocation, decision-type:security-policy, decision-type:compliance-ruling,
    decision-type:release-go-no-go, decision-type:priority-call). Attributes: displayName, description, impactLevel (team/org/product/company), reversibility
    (easily-reversible/costly-to-reverse/irreversible), typicalCadence
  Details:
  ────────────────────────────────────────
  #: 7
  Item: New edge kinds for the decision model — owns_decision_for (Responsibility → StackPart/Domain/Product entity, scoping what the decision applies to),
    decision_of_type (Responsibility → DecisionType), escalates_to (Responsibility → Responsibility, for escalation chains), informed_by (DecisionType → SkillArea,
    what expertise informs this decision type)
  Details:
  ────────────────────────────────────────
  #: 8
  Item: Populate decision instances — create ~20 DecisionType nodes, update ~30 existing responsibilities to carry the new attributes, create ~15 new decision-making
    responsibilities (e.g., responsibility:api-contract-decision, responsibility:infrastructure-vendor-decision, responsibility:security-architecture-decision) with
    ownership edges to stack-parts/domains
  Details:

  Tier 3 — Structural depth

  ┌─────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │                                                                           Item                                                                           │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 9   │ Edge kind diversity for library nodes — currently all library edges are applies_to. Add requires_skill_area, implements_workflow, involves_role as       │
  │     │ distinct edge kinds in the generator for semantic precision                                                                                              │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 10  │ Methodology graph nodes — 39 methodologies in library but no Methodology node kind. Add schema + instances, connect to workflows and processes           │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 11  │ More stack profiles — only 17 exist. Add LAMP, JAMstack, serverless patterns, data lake, ML inference, event-driven, CQRS stack profiles                 │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 12  │ Wiki pages from library READMEs — generate wiki pages with auto-linked graph context from specialization README.md files                                 │
  ├─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 13  │ Edge weights/confidence — add confidence attributes to library annotations for search ranking quality                                                    │
  └─────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘


---
\babysitter\docs\atlas-library-gaps.md

---
[ ] - ToolServer - model it better- how to run/use it if, where is the repo, etc. then enrich the graph with that information and connect it to the relevant entities (most imprortantly, the frameworks,systems,services,tools,libs it provides integrations for, and the relevant skills, skill areas). then enrich the catalog of tools by search mcp servers for existing components in the graph (that represent functionality that a mcp server could provide an interface for) and add the relevant toolserver to the graph (with connectivity)
