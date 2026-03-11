---
session: "promptlog-setup"
timestamp: "2026-03-11T13:50:33Z"
model: claude-opus-4-6
---

## Human

Adopted the promptlog spec from https://jackdanger.com/promptlog.md and set up
enforcement tooling. Created a Claude Code skill at `.claude/skills/promptlog.md`
to teach the agent the prompt log workflow. Then asked Claude to add a lefthook
pre-commit hook that requires a `prompts/*.md` file in every commit.

## Assistant

### Key decisions

**Lefthook over raw git hooks**: The project already uses lefthook for gitleaks
and trufflehog, so adding another command to `lefthook.yml` keeps all hooks in
one declarative config rather than maintaining a separate shell script in
`.git/hooks/`.

**Hook logic**: The hook checks staged files for at least one `prompts/*.md`
entry whenever non-prompt files are being committed. Commits that only touch
prompt files (e.g., backfills) pass through without a chicken-and-egg problem.
Merge and rebase commits are skipped since they're mechanical.

**Promptlog spec source**: Adopted verbatim from https://jackdanger.com/promptlog.md
rather than writing a custom spec. The format (single YAML frontmatter block,
`## Human` / `## Assistant` sections, decision-focused assistant entries) matched
the project's needs without modification.
