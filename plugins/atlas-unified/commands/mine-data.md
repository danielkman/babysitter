---
description: Data mining — discover the data models/entities a domain requires from the Atlas graph.
argument-hint: The domain or goal to mine data for.
allowed-tools: Read, Grep, Write, Task, Bash, Edit, Glob, AskUserQuestion, TodoWrite, Skill, mcp__atlas__atlas_public_search, mcp__atlas__atlas_public_record, mcp__atlas__atlas_public_neighbors, mcp__atlas__atlas_public_kinds, mcp__atlas__atlas_public_clusters, mcp__atlas__atlas_public_wiki_page
---

Invoke the babysitter:babysit skill (using the Skill tool) and follow its instructions (SKILL.md). Run the PRE-AUTHORED atlas process bundled with this plugin — do NOT interview the user or author a new process. Create the run directly from this bundled entry and iterate it to completion:

```
${{{pluginRootEnvVar}}}/processes/atlas-data-mining.mjs#process
```

(e.g. `babysitter run:create --process-id atlas-data-mining --entry "${{{pluginRootEnvVar}}}/processes/atlas-data-mining.mjs#process" --harness <this-harness>`, then iterate.) Pass the user arguments below as the run's stated need / process inputs. Continue executing in this same turn; do not stop after the Skill tool returns. Use the atlas skill and the Atlas MCP tools (mcp__atlas__atlas_public_*) for all graph queries.

User arguments for this command:

$ARGUMENTS
