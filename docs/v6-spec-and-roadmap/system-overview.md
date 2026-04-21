# System Overview

→ [Documentation Index](README.md) | Next: [Current State Analysis](current-state.md)

## Full Stack Scope and Capabilities

The a5c.ai Universal Harness Stack provides a comprehensive platform for building, deploying, and managing AI agent applications across multiple harnesses and execution environments. The V6 architecture establishes a modular, extensible foundation that supports the complete agent lifecycle from development to production.

**End-to-End Feature Capabilities**:
- **Multi-Harness Support**: Claude Code, Copilot CLI, Gemini CLI, Cursor, Pi, and custom harnesses
- **Agent Orchestration**: Deterministic, event-sourced orchestration with replay capabilities  
- **Session Management**: Persistent sessions with context, history, and memory across interactions
- **Plugin Ecosystem**: Extensible plugin system with meta-plugin framework for custom functionality → [Plugin Ecosystem](plugin-ecosystem.md)
- **Distributed Human-AI Coordination**: Serverless breakpoint multiplexing for escalating decisions to human responders with cryptographic verification
- **Governance & Security**: Policy engines, authority chains, sandbox execution, and mandate enforcement → [Security Architecture](security-architecture.md)
- **Cost Management**: Token tracking, budgeting, and cost optimization across providers
- **Observability**: Real-time monitoring, health checks, and diagnostic capabilities
- **Development Tools**: Process libraries, skill management, and agent development frameworks

## System Boundaries and Integration Points

**Core System Boundaries**:
- **Agent Runtime**: Model communication, agentic loops, in-memory session management → [V6 Architecture Vision](v6-vision.md)
- **Agent Platform**: Persistence, plugin system, tool ecosystems, protocol adaptation
- **Orchestration Layer**: Babysitter SDK integration, process orchestration, workflow management
- **Application Layer**: Complete solutions with governance, memory, cost tracking, and observability

**External Integration Points**:
- **Model Providers**: OpenAI, Anthropic, local models, custom endpoints
- **Development Environments**: VS Code, JetBrains, command-line interfaces
- **Human Coordination Systems**: Git repositories (.breakpoints/ directories), GitHub Issues, AEQ servers, custom backends
- **CI/CD Systems**: GitHub Actions, custom pipelines, deployment orchestration
- **Monitoring Systems**: Prometheus, custom metrics, webhook integrations
- **Storage Systems**: Local filesystem, cloud storage, database backends

## Capability Matrix by Layer

| Capability | Runtime | Platform | Orchestration | Application |
|------------|---------|----------|---------------|-------------|
| Model Communication | ✓ | ✓ | ✓ | ✓ |
| Session Persistence | - | ✓ | ✓ | ✓ |
| Plugin System | - | ✓ | ✓ | ✓ |
| Human Coordination | - | - | ✓ | ✓ |
| Governance & Security | - | Plugin | ✓ | ✓ |
| Cost Tracking | - | Plugin | ✓ | ✓ |
| Process Orchestration | - | Basic | ✓ | ✓ |
| Memory Management | Basic | Plugin | ✓ | ✓ |
| Observability | Events | Plugin | ✓ | ✓ |

## Relationship to a5c.ai Ecosystem

The Universal Harness Stack serves as the foundational platform for the broader a5c.ai ecosystem, providing:
- **Agent Development Foundation**: Core abstractions for building AI agents
- **Deployment Platform**: Production-ready orchestration and management → [Operational Readiness](implementation/operational-readiness.md)
- **Integration Hub**: Connecting multiple harnesses, tools, and services
- **Innovation Platform**: Extensible architecture for new capabilities and workflows

---

**Related Documents**: [Current State Analysis](current-state.md) | [V6 Vision](v6-vision.md) | [Package Specifications](package-specs.md)