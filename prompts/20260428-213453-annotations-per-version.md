---
session: "jovial-banzai-2848b1"
timestamp: "2026-04-28T21:34:53Z"
model: claude-opus-4-7
---

## Human

> ensure your git worktree is based on staging. I noticed that annotations are
> specific to a version and when I change versions the annotation stays across
> all versions. That's not what I was expecting. What do you think makes sense
> and what would be the implementation plan?

> proceed

> When you're done please make a PR

## Assistant

## Key decisions

**Diagnosis**: `src/annotations/annotations.ts` keeps a single module-level
array. Versions persist code, geometry, color regions, and thumbnails — but
neither `loadVersionIntoEditor` nor `saveVersion` touches annotations. So they
leak across version switches by design (well, by oversight).

**Mental model chosen**: per-version snapshots, write-on-save, swap-on-load.
This mirrors how `code` and `colorRegions` already behave — annotations are
feedback *about a particular version of the model*, and once geometry changes
the anchor may not even land on a face anymore. Tying them to a version is
the only model that doesn't drift into nonsense.

**Tradeoff accepted**: annotations made while viewing a version but not saved
are dropped on nav-away (same lifecycle as edited-but-unsaved code). Picked
this over write-through-on-edit because (a) it's symmetric with how the
editor already behaves, (b) write-through would silently mutate historical
versions, which is worse than losing scratch work. If users find the loss
annoying, a "dirty" indicator on nav-away is a small follow-up.

**Schema bump 1.2 → 1.3**: top-level `annotations` was the wrong place. Moved
to `versions[].annotations`. 1.2 imports migrate the top-level field onto the
*latest* exported version (best guess at where they belonged when exported,
since 1.2 only stored annotations for the active session). Forward-compat is
silent — older readers ignore new fields per the existing schema policy.

**Wiring decision**: there are five distinct version-load code paths in
main.ts (loadVersionIntoEditor, sessionBar nav, gallery click,
partwright.loadVersion, partwright.navigateVersion), each duplicating
setValue + runCodeSync + rehydrateColorRegions in slightly different ways.
Rather than refactoring those into a single helper (out of scope for a
bug fix), I added one `applyVersionAnnotations` helper and called it at
each site — same shape as the existing `rehydrateColorRegions` pattern. The
duplication was already there; I'm not making it worse, and consolidating
all five paths is its own task.

**Where saveVersion grabs the snapshot**: in `sessionManager.saveVersion`,
not at the call site. The five call sites that save versions (manual save,
runAndSave, paint-preserve fork x2, paint-clean sibling) all funnel through
sessionManager — putting `serializeAnnotations()` there means every save
picks up annotations consistently with no per-call-site bookkeeping.

**Session boundaries**: `createSession`, `closeSession`, `clearAllSessions`
all `loadAnnotations([])` so a brand-new context starts blank. Without this,
creating a fresh session while a stale annotation lingered would carry it
across the boundary.

**Verification**: drove the dev server with chrome-devtools-mcp, ran a
five-step scenario (v1 unannotated, annotate→save v2, clear-annotate→save
v3, navigate v1↔v2↔v3) and confirmed annotations swap correctly. Also
synthesized a 1.2-shape import payload to verify back-compat — top-level
annotations correctly land on the highest-index version.
