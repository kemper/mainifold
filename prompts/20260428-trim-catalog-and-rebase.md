---
session: "trim-catalog-and-rebase"
timestamp: "2026-04-28T20:45:00Z"
model: claude-opus-4-7
tools: []
---

## Human

Keep only the OpenSCAD twisted, chess rook, christmas tree, and twisted vase in the catalog. Remove the others. Then update the branch from latest staging and resolve conflicts.

## Assistant

### Key decisions

Trimmed catalog to the four most visually distinct entries — kept the source files in `examples/` untouched (still useful as reference and for re-adding to the manifest later via the generator script's ENTRIES list). Updated `scripts/generate-catalog.cjs` ENTRIES to match so re-running the script preserves the curated set rather than regenerating the dropped six.

Rebased onto latest staging (which now has per-version annotations and an annotation-aware Save button). No conflicts in the rebase since the catalog/export work touches different surface area.
