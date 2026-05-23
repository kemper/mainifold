---
session: "attach-modal-symmetry"
timestamp: "2026-04-28T22:00:00Z"
model: claude-opus-4-7
tools: []
---

## Human

The attach-image modal shouldn't have a label edit box next to the
URL input — it doesn't match the upload section.

## Assistant

### Change

The URL paste section had a separate `<input>` for the label that
sat next to the URL field. The file upload section had no such
control — it auto-derives the label from the filename and defaults
to "Perspective" when nothing matches. The asymmetry was confusing.

Dropped the URL label input entirely. The Load URL button now runs
the same `PRESET_LABELS.find(p => url.toLowerCase().includes(...))`
logic used for filenames, defaulting to "Perspective" on no match.
Trimmed the modal-level explanation to drop the "pick a preset or
type a custom caption" line since the modal no longer exposes
label editing — that lives in the tile after attaching.

Net effect: both halves of the modal now ask the same thing of the
user (pick an image source, hit go) and produce the same kind of
tile.
