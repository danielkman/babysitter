## Agent Mention Protocol

- `@<agent-name>` mentions in issues, PR comments, and commit messages are explicit dispatch requests that bind to a real agent definition file. Before honoring a mention, verify the corresponding agent file exists (e.g. `.claude/agents/<agent-name>.md`, `.a5c/agents/<agent-name>.md`, or the equivalent location for the active harness). If it does not exist, the mention is invalid — report it rather than silently improvising.
- When you are the mentioned agent, load your own definition file first. It is the source of truth for your scope, tools, and constraints; do not act on a mention that contradicts it.
- Do not respond to mentions addressed to other agents. Only the mentioned agent acts; others stay silent.
- When handing off to another agent, mention them by the exact name of their definition file (without path or extension). Do not invent agent names — if the needed agent does not exist, say so rather than mentioning a nonexistent `@<name>`.
- Acknowledge the dispatch once, post a single consolidated response when the work is done, and avoid streaming incremental chatter into the thread.
