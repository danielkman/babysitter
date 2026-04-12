## Pull Request Policies

- Keep PRs small and focused. One logical change per PR — if the diff grows past a reviewer's mental budget, split it.
- PR titles follow conventional-commit style: `<type>(<scope>): <imperative summary>`. Examples: `feat(sdk/runtime): add replay cursor`, `fix(catalog): handle missing index`.
- PR body must state the "why" (motivation, linked issue), the "what" (high-level summary of the change), and a "how to verify" section (commands, screenshots, or test plan).
- Never open a PR that fails lint, typecheck, or tests locally. If CI must catch it, the PR is not ready.
- Do not mix refactors with behavior changes in the same PR unless the refactor is a prerequisite and is called out explicitly.
