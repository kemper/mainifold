---
session: "remove-trufflehog"
timestamp: "2026-04-08T20:39:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Remove trufflehog pre-commit hook — it was supposed to have been removed already and it breaks in git worktrees.

## Changes

- `lefthook.yml`: Removed the `trufflehog` command from pre-commit hooks. Gitleaks remains for secret scanning.
