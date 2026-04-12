## Handoff Conventions

- When handing off work to another agent or a human, post an explicit handoff message: what was done, what is pending, where state lives (branch, PR, run directory), and what the next actor needs to decide.
- Do not hand off silently by opening a PR and walking away. The downstream actor should not have to reverse-engineer your mental model from the diff.
- If the handoff is conditional ("proceed only if X"), state the condition explicitly. Ambiguous handoffs are indistinguishable from abandoned work.
