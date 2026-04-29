---
session: "image-label-unification"
timestamp: "2026-04-28T19:00:00Z"
model: claude-opus-4-7
tools: []
---

## Human

The split between `angle` and `label` doesn't make sense — perspective
images don't render meaningfully in the gallery now. Unify these:
one label, shown in the gallery, with presets available rather than
always typing.

## Assistant

### Key decisions

**Collapsed `angle` and `label` into a single `label` field.** The
previous design pretended angle was structural metadata and label
was display, but that was never useful — the elevations grid never
actually overlayed images per view, only the strip at the top showed
them. With the split gone, every image has just `{id, src, label?}`.
The label is what shows in the Gallery, the lightbox, and tooltips.
Common values like `Front` / `Right` / `Back` / `Left` / `Top` /
`Perspective` are exposed as **presets** — items whose label matches
one (case-insensitive) sort first in preset order in the Elevations
strip, but they're not a closed set. Users pick a preset for one-click
common cases or type a custom string like "south elevation, morning".

**Datalist-driven input.** The Images tab tile and the URL-paste row
in the attach modal use a single shared `<datalist id="image-label-presets">`
populated with the six presets. A native `<input list="...">` gives
free-form typing AND a quick-pick dropdown of presets in one control.
No separate dropdown vs. text input.

**Sort helper.** New `sortImagesByPreset` in `multiview.ts` does a
stable sort: items whose label matches a preset come first in preset
order, others keep insertion order at the end. `presetIndex(label)`
in `db.ts` handles case-insensitive lookup. Both gallery.ts and
multiview.ts strip use the same helper, so ordering is consistent.

**Three-stage read-time migration in `db.ts`:**
1. Pre-rename: `referenceImages` → `images`.
2. Pre-array: `images` as `{front:'url',...}` object → `[{id,src,label}]`.
3. Pre-unification: items as `{id, angle, src, label?}` → drop `angle`,
   copy capitalized angle into `label` if no label was present.

So an old item with `angle:'perspective'` and no label becomes
`{id, src, label:'Perspective'}` — which is now exactly what users
see and can edit. No "Perspective"-special-case anywhere.

**API.** `setImages([{src, label?}, ...])` and
`addImage({src, label?})` — no more `angle` parameter. Validation
is the same shape (string, optional, allowEmpty:true, trimmed).
`getImages()` returns `[{id, src, label?}, ...]`.

### Verification

- `npm run build` clean.
- `setImages([{src, label:'Front'}, {src, label:'south elevation,
  morning'}, {src, label:'Right'}, {src} /* no label */, {src,
  label:'Perspective'}])` produces this Gallery order:
  `['Front', 'Right', 'Perspective', 'south elevation, morning', null]`
  — presets first in preset order, custom labels after, unlabeled
  last with no caption.
- Items have keys exactly `[id, label, src]` — no leftover `angle`.
- Editing a tile's label inline (typing or picking from the datalist
  dropdown) commits on blur; reload preserves all five labels.
- The shared datalist exposes the six presets to every label input.
