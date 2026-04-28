---
session: "add-release-yml"
timestamp: "2026-04-28T15:50:00Z"
model: claude-opus-4-7
tools: [claude-code]
---

## Human

I'd like to merge staging into main and create a PR. Would it make
sense for me to introduce a git hook or something that produces a
changelog on every merge to main? Eventually I'd like to declare a 1.0
release and then from there on out have a changelog of new releases
and what changed. Report back your thoughts.

## Approach

Recommended skipping the local-git-hook idea (hooks don't run when
GitHub performs the merge button click) and proposed a two-phase plan:

1. Pre-1.0: use GitHub's built-in auto-generated release notes with a
   `.github/release.yml` to group PRs by label.
2. At 1.0+: switch to release-please for a committed `CHANGELOG.md`
   and automated semver bumps driven by Conventional Commits.

The user picked phase 1. Added `.github/release.yml` with categories
mapped to existing repo labels: enhancement → Features, bug → Bug
Fixes, documentation → Documentation, `*` → Other Changes. Also wired
in an `ignore-for-release` exclusion label for chore PRs that should
not appear in release notes.
