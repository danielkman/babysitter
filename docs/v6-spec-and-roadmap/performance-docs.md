# Performance Considerations & Documentation

→ [Documentation Index](README.md) | Previous: [Testing Framework](testing-framework.md)

## Purpose

This document defines how V6 should talk about performance and documentation quality. It is intentionally conservative. If a claim is not tied to a baseline, a measurement method, and a fallback plan, it is a hypothesis rather than a target.

## Performance Rules

Any V6 performance target must include:

- baseline source,
- measurement command or procedure,
- acceptance threshold,
- fallback action if the threshold is missed.

## Current Maturity Position

At the current documentation stage, V6 does not commit to broad numeric performance improvements across many future packages. Earlier optimistic figures were useful as pressure tests, but they are not mature commitments without implementation context.

## Acceptable Near-Term Targets

The only near-term performance targets that are mature enough to discuss are targets attached to a specific executable slice, for example:

- plugin compilation or manifest validation latency for a compiler change,
- install-time regression checks for plugin packaging,
- bundle or startup impact for a narrowly scoped internal extraction.

Each of those must name the exact package, command, and comparison baseline.

## Documentation Quality Gates

The documentation set should be judged with concrete checks:

- required core files exist,
- markdown links resolve,
- placeholder markers are absent,
- normative, deferred, and invalidated ideas are distinguishable,
- roadmap claims have validation and rollback framing.

## Failure Handling

If a target is missed, the default response is not to redefine success silently. The default response is to:

1. record the miss,
2. explain the tradeoff,
3. decide whether to narrow scope, accept the cost, or roll back.

## Documentation Standard

Performance sections in V6 docs should avoid:

- numbers detached from measurement method,
- claims about packages that do not yet exist,
- performance promises that assume broad decomposition is automatically faster,
- "production ready" language without operational evidence.

## Recommended Metrics For Real Slices

When a concrete slice is chosen, use a small metric set:

- before/after command duration,
- before/after artifact size if packaging changes,
- pass/fail compatibility checks,
- observed regressions and explicit acceptance decision.

---

**Related Documents**: [V6 Architecture Specification](v6-architecture-specification.md) | [V6 Implementation Roadmap](v6-implementation-roadmap.md) | [Adversarial Improvements](adversarial-improvements.md)
