---
session: "docs-sync-recent-features"
timestamp: "2026-04-27T20:00:00Z"
model: claude-opus-4-7
tools: [Read, Edit, Grep, Glob, Bash]
---

## Human

Ensure your working tree branch is based off the staging branch. Then,
review our current docs (help, README, ai.md, etc.) and create a PR with
any updates that might be needed based on recent work that did not update
those files.

## Changes

Audited recent commits on `staging` (color regions, diff view tab,
toolbar import button, grid plane toggle, editor diagnostics, browser
history fix, viewport gizmo) against `README.md`, `CLAUDE.md`,
`AGENTS.md` (symlink to CLAUDE.md), `GEMINI.md` (symlink), and
`public/ai.md`. Found three concrete drift points:

1. **Color regions API was undocumented in `public/ai.md`.**
   `partwright.help('paintRegion')` already pointed to
   `/ai.md#color-regions`, but that anchor didn't exist.
2. **`?diff` URL parameter was missing from the Query Parameters table**
   in CLAUDE.md (and so AGENTS.md / GEMINI.md via the symlink).
3. **README export/architecture sections were stale** — listed only GLB
   and STL, and the architecture tree was missing `obj.ts`,
   `threemf.ts`, and `color/`.

Files touched:

- `public/ai.md`: Added `## Color regions` section (new TOC entry +
  anchor), and added `paintRegion` / `listRegions` / `clearColors` to
  the Console API listing.
- `CLAUDE.md`: Added `?diff` to the Query Parameters table. Picked up
  by AGENTS.md and GEMINI.md automatically (both are symlinks to
  CLAUDE.md).
- `README.md`: Added a "Color regions" feature bullet, updated Export
  bullet to all four formats, added `exportOBJ` / `export3MF` /
  `paintRegion` etc. to the Console API code block, and added
  `obj.ts` / `threemf.ts` / `color/` to the architecture tree.

No code changes; help page (`src/ui/help.ts`) intentionally not
expanded — paint mode and diff view are accessible from the UI and a
guided tour, and the help page is meant as a friendly overview rather
than a full feature reference.

## Verification

- `git diff --stat` shows only the three doc files modified.
- Manually re-checked `partwright.help('paintRegion')` references:
  the new anchor `#color-regions` exists in `public/ai.md`.
