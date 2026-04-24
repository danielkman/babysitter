#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { createClient } from '@a5c-ai/agent-mux-core';
import { registerBuiltInAdapters } from '@a5c-ai/agent-mux-cli/bootstrap';
import { App, builtinPlugins, defaultExternalPluginsDir, loadExternalPlugins } from '../index.js';

function userPluginsDisabled(): boolean {
  const value = process.env.AMUX_TUI_NO_USER_PLUGINS;
  return value === '1' || value === 'true';
}

function builtInAdaptersDisabled(): boolean {
  const value = process.env.AMUX_TUI_NO_BUILTIN_ADAPTERS;
  return value === '1' || value === 'true';
}

async function main() {
  const client = createClient();
  if (!builtInAdaptersDisabled()) {
    registerBuiltInAdapters(client);
  }

  const plugins = [...builtinPlugins];
  if (!userPluginsDisabled()) {
    try {
      const external = await loadExternalPlugins(defaultExternalPluginsDir());
      plugins.push(...external.plugins);
      for (const error of external.errors) {
        process.stderr.write(`amux-tui: failed to load plugin from ${error.source}: ${error.error}\n`);
      }
    } catch (error) {
      process.stderr.write(`amux-tui: external plugin discovery failed: ${(error as Error).message}\n`);
    }
  }

  render(<App client={client} plugins={plugins} />);
}

void main();
