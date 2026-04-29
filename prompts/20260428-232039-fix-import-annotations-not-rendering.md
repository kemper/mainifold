---
session: "fix-import-annotations"
timestamp: "2026-04-28T23:20:39Z"
model: claude-opus-4-7
---

## Human

> I merged your PR but noticed that now import now longer shows any
> annotations. Can we fix that in a new PR?

## Assistant

## Key decisions

**Diagnosis**: after the per-version annotations PR landed, two distinct
`loadAnnotations` calls were happening on import:

1. `importSession` ended with `loadAnnotations(latest.annotations)` so the
   in-memory store was populated before the function returned.
2. The caller (`importSessionPayload` in main.ts and the analogous path in
   sessionList.ts) then ran `openSession` → `loadVersionIntoEditor` (or
   `onLoadVersion`), which calls `applyVersionAnnotations(version)` —
   another `loadAnnotations` of the same data.

Each `loadAnnotations` fires `onChange`, which triggers the
`refreshAnnotationDependentPanes` listener → `updateMultiView` →
`renderViewsToContainer`, which builds a fresh `Sprite` + `CanvasTexture`,
adds it to the offscreen scene, renders, removes it, and disposes it.

In quick succession during import, this double-rebuild lands the multiview
offscreen WebGLRenderer in a state where the FINAL render frame doesn't
include the annotation pixels — even though the live overlay (interactive
viewport) shows them correctly. Symptom: AI Views and Elevations tabs
appear to have no annotations after import.

**Fix**: remove the redundant `loadAnnotations` call from `importSession`.
Both existing callers route through `applyVersionAnnotations` after
`importSession` returns, so the annotations still get loaded — just once
instead of twice. The single load fires `onChange` once and the multiview
rebuild lands cleanly.

**Why fix here, not at the multiview render**: the multiview-render path
is shared with many other code-update flows (manual edit, runAndSave,
gallery click, etc.) and works correctly there. The bug only manifests
when two `loadAnnotations` happen with the offscreen renderer mid-flight.
Eliminating the redundant load is precise and doesn't change behavior of
any other code path. (If we wanted defense-in-depth, we could also debounce
`refreshAnnotationDependentPanes`, but that adds complexity to fix what is
really just a duplicate write.)

**Tested**: round-trip export/import shows annotations on the latest
version's AI Views; per-version swap (load v1, load v2) still works;
schema-1.2 back-compat still attaches top-level annotations to the latest
version on import.

**Risk note discovered while debugging**: Vite was serving a different
worktree's source than mine (CWD mismatch on a stale `npm run dev`
process), which caused several false-negative test runs where my source
edits weren't even live. Lesson: when adding console-log diagnostics that
don't appear in the browser, verify `lsof -p <vite-pid> | grep cwd` before
spelunking deeper. Lost ~30 min before catching this.
