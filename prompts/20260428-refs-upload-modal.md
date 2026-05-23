---
session: "refs-upload-modal"
timestamp: "2026-04-28T16:20:00Z"
model: claude-opus-4-7
tools: []
---

## Human

Replace the Refs button file uploader with a modal that describes what
uploading a reference means, offers a button to choose files, and also
supports pasting an image URL. Make the worktree base on staging and
open a PR.

## Assistant

### Key decisions

Refactored `createRefLoader` in `src/ui/sessionBar.ts` so the Refs
button now opens `showRefUploadModal()` instead of immediately invoking
the hidden `<input type=file>`. The modal explains how reference
images plug into the Elevations tab, then exposes two paths:

- **Upload from your computer** — a "Choose files…" button that wires
  to the same hidden file input. Existing filename-based angle
  assignment (front/right/back/left/top/perspective) is preserved.
- **Paste an image URL** — a URL field, an angle dropdown
  (auto-suggests when the URL contains an angle keyword), and a Load
  URL button. Fetched bytes are converted to a data URL via
  `FileReader.readAsDataURL` and dispatched through the existing
  `onLoadReferenceImages` callback.

To make the URL path actually work, relaxed `connect-src` in the CSP
from `'self'` to `'self' https:` in both `vite.config.ts` (dev) and
`public/_headers` (production). The modal surfaces a CORS-aware error
("the host may block cross-origin requests — try downloading and
uploading instead") when a fetch fails, so users have a clear fallback.
