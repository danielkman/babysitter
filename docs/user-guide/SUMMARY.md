# Summary

This is the GitBook-style table of contents for the Babysitter User Guide.

---

## Home

* [Welcome](./index.md)

---

## Getting Started

* [Overview](./getting-started/README.md)
* [Installation](./getting-started/installation.md)
* [Quickstart](./getting-started/quickstart.md)
* [First Run](./getting-started/first-run.md)
* [Migration: Prod to v6](./getting-started/migration.md)

---

## Features

* [**Process Library** (current library snapshot)](./features/process-library.md)
* [**Adapters** (run on any harness)](./features/adapters.md)
* [**Best Practices Guide**](./features/best-practices.md)
* [Breakpoints](./features/breakpoints.md)
* [Hooks](./features/hooks.md)
* [Quality Convergence](./features/quality-convergence.md)
* [Process Definitions](./features/process-definitions.md)
* [Journal System](./features/journal-system.md)
* [Run Resumption](./features/run-resumption.md)
* [Parallel Execution](./features/parallel-execution.md)

---

## Harnesses

* [Install Matrix](./harnesses/install-matrix.md)
* [Claude Code](./harnesses/claude-code.md)
* [Codex](./harnesses/codex.md)

---

## Tutorials

* [Build a REST API](./tutorials/beginner-rest-api.md)
* [Custom Process](./tutorials/intermediate-custom-process.md)
* [Multi-Phase Workflows](./tutorials/advanced-multi-phase.md)

---

## Reference

* [Slash Commands](./reference/slash-commands.md)
* [CLI Reference](./reference/cli-reference.md)
* [Adapters CLI](./reference/adapters-cli.md)
* [Configuration](./reference/configuration.md)
* [Error Catalog](./reference/error-catalog.md)
* [Glossary](./reference/glossary.md)
* [FAQ](./reference/faq.md)
* [Troubleshooting](./reference/troubleshooting.md)

---

## Sitemap

```
docs/user-guide/
|
+-- index.md                              # Landing page
+-- SUMMARY.md                            # Table of contents (this file)
+-- navigation.md                         # Navigation configuration
|
+-- getting-started/                      # Getting Started Section
|   +-- README.md                         # Overview
|   +-- installation.md                   # Installation guide
|   +-- quickstart.md                     # Quick configuration
|   +-- first-run.md                      # First workflow execution
|   +-- migration.md                      # Prod (0.0.x) to v6 migration guide
|
+-- features/                             # Core Features
|   +-- process-library.md                # SDK-managed built-in library and current counts
|   +-- adapters.md                       # Run Babysitter on any harness (v6)
|   +-- best-practices.md                 # Comprehensive best practices guide
|   +-- breakpoints.md                    # Human-in-the-loop approval
|   +-- hooks.md                          # Extensible lifecycle events
|   +-- quality-convergence.md            # Iterative quality improvement
|   +-- process-definitions.md            # Workflow templates
|   +-- journal-system.md                 # Event sourcing and audit
|   +-- run-resumption.md                 # Continue interrupted work
|   +-- parallel-execution.md             # Concurrent task execution
|
+-- harnesses/                            # Supported AI coding harnesses
|   +-- install-matrix.md                 # All supported harnesses + install + hook models
|   +-- claude-code.md                    # Claude Code (fully supported)
|   +-- codex.md                          # Codex (fully supported)
|
+-- tutorials/                            # Step-by-Step Tutorials
|   +-- beginner-rest-api.md              # Build REST API (beginner)
|   +-- intermediate-custom-process.md    # Custom process (intermediate)
|   +-- advanced-multi-phase.md           # Multi-phase workflows (advanced)
|
+-- reference/                            # Technical Reference
|   +-- slash-commands.md                 # In-session /babysitter:* command surface
|   +-- cli-reference.md                  # Command-line interface
|   +-- adapters-cli.md                   # Host-side `adapters` CLI reference (v6)
|   +-- configuration.md                  # Config options
|   +-- error-catalog.md                  # Error codes and solutions
|   +-- glossary.md                       # Terminology
|   +-- faq.md                            # Frequently asked questions
|   +-- troubleshooting.md                # Problem resolution
```

---

## Document Statistics

| Section | Pages | Status |
|---------|-------|--------|
| Getting Started | 5 | Complete |
| Features | 10 | Complete |
| Harnesses | 3 | Complete |
| Tutorials | 3 | Complete |
| Reference | 8 | Complete |
| Navigation | 3 | Complete |
| **Total** | **32** | **Active** |

---

## Quick Reference Links

### By Experience Level

**Beginner**
- [Installation](./getting-started/installation.md)
- [First Run](./getting-started/first-run.md)
- [REST API Tutorial](./tutorials/beginner-rest-api.md)
- [Glossary](./reference/glossary.md)

**Intermediate**
- [Breakpoints](./features/breakpoints.md)
- [Quality Convergence](./features/quality-convergence.md)
- [Custom Process Tutorial](./tutorials/intermediate-custom-process.md)

**Advanced**
- [Process Definitions](./features/process-definitions.md)
- [Journal System](./features/journal-system.md)
- [Multi-Phase Tutorial](./tutorials/advanced-multi-phase.md)

---

### By Task

**Setup and Installation**
- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Configuration](./reference/configuration.md)

**Daily Use**
- [CLI Reference](./reference/cli-reference.md)
- [Breakpoints](./features/breakpoints.md)
- [Run Resumption](./features/run-resumption.md)

**Problem Solving**
- [Troubleshooting](./reference/troubleshooting.md)
- [Error Catalog](./reference/error-catalog.md)
- [FAQ](./reference/faq.md)

**Learning**
- [REST API Tutorial](./tutorials/beginner-rest-api.md)
- [Custom Process Tutorial](./tutorials/intermediate-custom-process.md)
- [Multi-Phase Tutorial](./tutorials/advanced-multi-phase.md)

---

## Related Resources

- [GitHub Repository](https://github.com/a5c-ai/babysitter)
- [Releases and Changelog](https://github.com/a5c-ai/babysitter/releases)
- [Issue Tracker](https://github.com/a5c-ai/babysitter/issues)
- [Discussions](https://github.com/a5c-ai/babysitter/discussions)

---

*Last updated: 2026-01-25*
