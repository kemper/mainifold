---
session: "annotations-cleanup"
timestamp: "2026-04-27T21:10:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Grep", "Bash"]
---

## Human

Do we need to cleanup cruft from past flailing and failed attempts?

## Assistant

### Audit and small fixes

Walked each annotations file looking for stale comments, dead code, and
artifacts of earlier architecture iterations. Net deletion of ~50 lines
with ~13 added back; no behavior change.

Specific cruft found and fixed:

- **selectMode top doc** claimed "select mode does NOT lock orbit" —
  out of date since the drag-conflict-with-OrbitControls fix locked
  orbit in select. Corrected.
- **annotateMode.activate** had three blocks of meta-commentary about
  mutual-exclusion sequencing (one of them an actual question to a
  past version of myself). Replaced with one intent-stating comment;
  moved the trailing `forceDeactivateText({keepSession: true})` call
  to the top alongside the other `forceDeactivate*` calls.
- **annotateMode.deactivate** had a dangling explainer comment about
  what *isn't* in the function ("If no other annotate sub-mode is
  taking over the session, end it"). Removed.
- **annotations.ts** exported three never-imported helpers
  (`getAnnotations`, `getStrokeCount`, `getTextCount`) added
  speculatively during the discriminated-union refactor. Removed.
- **sessionPlane.showPlaneOutline** computed a `normal` `Vector3` it
  never used and silenced the warning with `void normal;`. Removed
  both the computation and the hack.
- **selectMode raycaster.params.Line** had a stale comment about
  "bumped via per-instance setting on Line2 if needed" that no longer
  matched the code. Removed.

### What was NOT removed

- The `forceDeactivate({keepSession?: boolean})` API — non-trivial but
  load-bearing for pen↔text sub-mode swaps that share a session plane.
- The `dragLiveObject` cache in selectMode — central to the in-place
  drag mutation that avoids per-frame allocations.
- The `_maxInstanceCount` cache-bust workaround in
  `setLine2Points` — actively keeps the live preview rendering.

### Verified

`npm run build` passes.
