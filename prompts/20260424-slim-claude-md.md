---
session: "slim-claude-md"
timestamp: "2026-04-24T14:30:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

Propose and implement a slim-down of CLAUDE.md.

## Approach

CLAUDE.md was 921 lines, serving as both a dev guide and an AI agent
usage manual. The agent usage content (Manifold/CrossSection API
reference, console API docs, session workflow, verification patterns,
photo-to-model workflow) is already covered in `public/ai.md` (593
lines), making ~750 lines redundant.

Replaced the duplicated sections with a short pointer to `public/ai.md`
plus a key-rules summary. Kept all dev-focused content: deployment,
architecture, smoke test, dev guidelines, common errors.

Result: 921 → 151 lines (84% reduction).
