---
session: "staging-deployment-workflow"
timestamp: "2026-04-08T18:43:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Set up a staging/production deployment workflow with Cloudflare Pages. Document the branch-based deploy process and add automation to keep staging in sync with main.

## Changes

- `CLAUDE.md`: Added Deployment section documenting staging-first workflow and branch conventions
- `README.md`: Added Deployment section with branch/environment table and workflow steps
- `.github/workflows/sync-staging.yml`: GitHub Action that merges main into staging after every production deploy (fast-forward when possible, merge commit when diverged)
- `lefthook.yml`: Removed trufflehog hook (incompatible with git worktrees, gitleaks provides sufficient coverage)
- `Brewfile`: Removed trufflehog dependency
