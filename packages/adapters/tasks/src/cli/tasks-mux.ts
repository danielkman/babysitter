#!/usr/bin/env node

process.stderr.write('[adapters] "tasks-mux" is deprecated, use "adapters-tasks" instead.\n');
await import('./index.js');
