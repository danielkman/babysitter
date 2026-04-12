## Issue Linking

- If the work originates from an issue, reference it in the PR description with `Fixes #<n>`, `Closes #<n>`, or `Refs #<n>` (use `Refs` when the PR is partial).
- Commit messages may reference issues in the trailer: `Refs: #<n>`. Do not stuff issue numbers into the commit subject.
- When reopening a previously-closed issue scope, open a new issue that links back, rather than silently reusing the old one.
- If you discover a bug adjacent to the current task, open a separate issue. Do not expand PR scope to cover it.
