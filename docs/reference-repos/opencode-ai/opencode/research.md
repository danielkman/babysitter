# OpenCode Research

**Repository:** opencode-ai/opencode  
**Stars:** 11,982  
**License:** MIT  
**Language:** Go  
**Created:** 2024-09-01  
**Last Updated:** 2025-09-18  
**Default Branch:** main  
**Status:** ARCHIVED (moved to charmbracelet/crush)

## Archetype Classification: **Harness Framework**

Terminal-based AI assistant with TUI interface, multi-provider support, and tool integration. Original OpenCode harness now continued as "Crush" by Charm team.

## Repository Structure & Key Skills

### Core Harness Features
- **Interactive TUI**: Bubble Tea-based terminal interface
- **Multiple AI Providers**: OpenAI, Anthropic Claude, Google Gemini, AWS Bedrock, Groq, Azure OpenAI, OpenRouter
- **Session Management**: SQLite-based conversation persistence
- **Tool Integration**: Command execution, file search, code modification
- **LSP Integration**: Language Server Protocol support
- **File Change Tracking**: Visual diff and change tracking

### Novel Patterns & Methodologies

#### 1. **Terminal-First AI Interface**
CLI-native AI interaction patterns:
- **Bubble Tea TUI**: Modern terminal UI framework integration
- **Vim-like Editor**: Integrated text input with familiar keybindings
- **Session Persistence**: SQLite database for conversation management
- **External Editor Support**: Integration with user's preferred editor

#### 2. **Multi-Provider Architecture**
Unified AI provider abstraction:
- **Provider Abstraction**: Support for 7+ AI providers through unified interface
- **Model Selection**: Dynamic model and provider switching
- **Configuration Management**: JSON-based configuration system
- **Authentication Handling**: Multi-provider credential management

## Significance for Babysitter

### Harness Integration Ideas

#### Harness Adapter for OpenCode Successor (Crush)

**Capability Assessment for Babysitter Integration:**

| Capability | Status | Details |
|------------|---------|---------|
| **Custom Tools/MCP** | ⚠️ LIMITED | MCP-extensible architecture but limited custom tool execution beyond MCP servers |
| **Stop Hooks** | ❌ NOT SUPPORTED | No interruption hooks or lifecycle callbacks documented for stopping agent mid-conversation |
| **Plugin System** | ⚠️ LIMITED | Proposed Caddy-style compile-time plugin system (not runtime). Plugins are Go modules included at build-time via `xcrush` |

**Integration Viability:** POOR - Crush lacks runtime plugin system and critical stop-hook capability. Build-time plugin architecture incompatible with babysitter's dynamic orchestration needs.

- **Adapter implementation**: `createCrushAdapter` in `packages/sdk/src/harness/adapters/` (if technical limitations can be overcome)
- **Plugin structure**: `plugins/babysitter-crush/` for Charm Crush integration  
- **CLI integration**: Terminal UI patterns, session management, multi-provider support
- **Major limitation**: **Requires custom conversation pause/resume mechanism** due to lack of native stop hooks

#### TUI/Orchestration Improvements
- **Current limitation**: Our harness lacks sophisticated terminal UI and session management
- **Integration approach**: Adapt Bubble Tea TUI patterns and session persistence
- **Implementation scope**: Terminal UI layer for babysitter observer dashboard

## Repository Value: **Medium (Archived)**

This repository provides:
- Terminal-first AI harness architecture patterns (11K+ stars)
- Multi-provider abstraction and configuration management
- TUI interface patterns with Bubble Tea framework
- Session management and persistence patterns

Note: Original project archived and continued as charmbracelet/crush - successor should be evaluated for active development.

## Research Methodology Notes

Framework discovered through targeted harness search. Repository demonstrates terminal-native AI interface patterns and multi-provider architecture, though development has moved to successor project.