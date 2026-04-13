# lastmile-ai/mcp-agent

- **Archetype**: harness-framework
- **Stars**: 8,251
- **Last pushed**: 2026-01-25
- **License**: Apache-2.0
- **Discovered**: 2026-04-13
- **Source**: gh-search
- **Skills found**: 0 (Python framework, no SKILL.md files)

## Summary
Professional Python framework for building MCP (Model Context Protocol) agents using systematic patterns from Anthropic's "Building Effective Agents" guide. Implements composable workflow patterns including map-reduce, router, orchestrator, deep research, and swarm coordination with full MCP lifecycle management and Temporal-based durability for production agent deployment.

## Assessment
VERY HIGH VALUE. This represents the most sophisticated framework for systematic agent development found to date. Unlike skill collections, this provides actual implementation of proven agent architecture patterns with production-ready infrastructure. The systematic approach to agent patterns (parallel LLM, evaluator-optimizer, orchestrator, deep research) provides extractable processes for babysitter's orchestration capabilities. The MCP integration patterns and durable execution with Temporal offer valuable insights for babysitter's agent coordination and process persistence.

## Extraction Priority
VERY HIGH - Contains production-ready agent architecture patterns directly applicable to babysitter:
- Advanced agent orchestration patterns → babysitter process orchestration enhancements
- MCP integration lifecycle management → babysitter MCP server coordination
- Durable workflow execution patterns → babysitter process persistence and recovery
- Agent composition and routing patterns → babysitter skill coordination

## Processes
- **mcp-agent-lifecycle-management**: Systematic process for managing MCP server connections and agent coordination throughout execution lifecycle
  - Source: Core MCP lifecycle management and server aggregation patterns
  - Placement: specializations/tools-integration/
  - Inputs: MCP server configurations, agent specifications, connection requirements
  - Outputs: Managed MCP connections, agent coordination, lifecycle monitoring
  - Complexity: complex

- **parallel-agent-orchestration**: Process for coordinating multiple agents in map-reduce and parallel execution patterns
  - Source: Parallel LLM and workflow orchestration patterns
  - Placement: specializations/shared/
  - Inputs: Task decomposition requirements, agent specifications, coordination strategy
  - Outputs: Parallel execution plans, result aggregation, coordination monitoring
  - Complexity: complex

## Harness Integration Ideas
- **MCP Agent Framework Adapter**: Harness assimilation opportunity — create a plugin FOR mcp-agent that integrates babysitter orchestration capabilities into the MCP agent framework ecosystem
  - Adapter implementation: `createMcpAgentAdapter` in `packages/sdk/src/harness/adapters/`
  - Plugin structure: `plugins/babysitter-mcp-agent/` enabling mcp-agent users to access babysitter processes
  - Integration approach: Bridge babysitter's deterministic orchestration with mcp-agent's pattern-based workflow system
  - Current limitation: No babysitter integration available for mcp-agent framework users
  - Implementation scope: Python-to-TypeScript bridge, MCP protocol integration, workflow pattern mapping

## Implicit Procedural Knowledge
- **Agent Pattern Composition**: Methodology for systematically combining multiple agent patterns into coherent workflows
  - Source: Framework's composable pattern architecture and workflow examples
  - Placement: methodologies/agent-orchestration/
  - Why codify: Provides systematic approach to building complex agent workflows from proven patterns
  - Sketch: Pattern analysis → Composition strategy → Integration design → Coordination implementation → Quality validation
