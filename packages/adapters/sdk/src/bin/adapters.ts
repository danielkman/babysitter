#!/usr/bin/env node

process.stderr.write('[adapters] "adapters" is deprecated, use "adapters" instead.\n');
await import('./adapters.js');
