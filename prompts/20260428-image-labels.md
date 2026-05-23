---
session: "image-labels"
timestamp: "2026-04-28T18:30:00Z"
model: claude-opus-4-7
tools: []
---

## Human

Two more things on attached images:

1. Let me give each image a custom label.
2. Don't show "Perspective" as the default caption in the Gallery.
   Find a better solution that doesn't hardcode a special-case for the
   word "Perspective".

## Assistant

### Key decisions

**Separated `angle` (system metadata) from `label` (display caption).**
The previous design used the angle name as both routing info (which
elevation it pairs with) and the visible caption — so unlabeled
perspective images leaked "Perspective" as text in the Gallery. Added
an optional `label` field to `AttachedImage`. The Gallery now shows
the label and only the label; if there's no label, no caption is
rendered. The angle is still visible in the Images tab dropdown
(where it's structurally meaningful) and in the Elevations strip
tooltip, but it never serves as a fallback caption — that removes the
"if angle === perspective hide it" hardcode and replaces it with a
clean rule: captions come from user-provided labels, period.

**Label input in the Images tab.** Each tile now has a `Add a label…`
text input above the angle row. Commits on blur or Enter; Escape
reverts. Whitespace-only values are normalized to "no label" so
trailing spaces don't leave invisible captions in the Gallery.

**API.** `setImages` and `addImage` now accept an optional `label`
field on each item. Validated as a string with `allowEmpty: true`,
trimmed, and dropped from storage if empty. `getImages()` returns
items including the label when present. Tooltips on the Elevations
strip combine label and angle when both exist (`"south elevation
(Front) — click to enlarge"`); fall back to just angle otherwise.

### Verification

- `npm run build` clean.
- `setImages([{angle:'perspective', src:...}, {angle:'front', src:...,
  label:'south elevation, morning'}, {angle:'right', src:..., label:''}])`
  yields three tiles in the Gallery with captions `[null, "south
  elevation, morning", null]` — perspective image renders no text,
  empty-string label is dropped.
- Editing a label inline in the Images tab persists and propagates to
  the Gallery without a tab reswitch.
- Labels survive a page reload (IndexedDB roundtrip).
