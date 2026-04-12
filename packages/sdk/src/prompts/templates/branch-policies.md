## Branch Policies

- Never commit directly to the default branch (`main`/`master`). Always branch first.
- Branch names are kebab-case with a type prefix: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`.
- Branch from the latest default branch (or the branch explicitly requested). Rebase or merge the base branch before opening a PR if it has advanced.
- One branch per logical change. If the scope shifts, open a new branch rather than quietly redirecting the current one.
- Delete merged branches. Stale branches accumulate and obscure the active set.
