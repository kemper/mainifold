---
session: "export-cleanup"
timestamp: "2026-04-28T10:15:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Clean up cruft from the export code after the OBJ/3MF color export work.

## Assistant

### Key decisions

Deduplicated paint-detection logic and color hex extraction that was copy-pasted across exporters. Extracted shared helpers into `meshClean.ts`: `isPainted` (imported from `color/regions.ts`), `triColorHex`, `hasAnyPainted`, and `DEFAULT_COLOR_HEX`. Both OBJ and 3MF exporters now use these instead of inline duplicated logic. Net -32 lines.
