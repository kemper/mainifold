---
session: "ai-friendly-file-io"
timestamp: "2026-04-28T15:00:00Z"
model: claude-opus-4-7
tools: [Read, Edit, Write, Bash, Grep, Glob, playwright]
---

## Human

When AIs work on file export and import features they struggle because
they can't actually interact with the browser file picker. Same problem
existed with reference images. Propose a solution that lets local AIs
work with features that normally pop browser dialogs — stream/return file
contents over the `window.partwright` API so the agent can save bytes
itself, plus an export inbox so users can re-download recent exports.

## Changes

- `src/export/exportInbox.ts` (new): in-memory ring buffer (max 10) of
  recent export blobs with `registerExport` / `listExports` /
  `getExport` / `clearExports` / `onExportInboxChange`. Both the toolbar
  and the AI API read from this same store, so an export the human
  triggered remains downloadable and inspectable from agent code.

- Exporters split into pure builders + thin downloaders:
  - `src/export/gltf.ts`: new `buildGLB()` returning `{blob, filename, mimeType}`;
    `exportGLB()` calls it then `downloadBlob(..., 'GLB')`. Defines the shared
    `BuiltExport` interface re-used by the other builders.
  - `src/export/stl.ts`: new `buildSTL()`; `exportSTL()` thin wrapper.
  - `src/export/obj.ts`: new `buildOBJ()` — returns text/plain or
    application/zip depending on whether color regions are painted.
  - `src/export/threemf.ts`: new `build3MF()`.
  - `src/export/session.ts`: new `buildSessionJSON()` (also returns
    parsed `data`) and `buildRawCode()` (also returns `text` + `language`).

- `src/export/download.ts`: `downloadBlob()` now takes a `source` label
  and registers the blob in the inbox. New `{ register: false }` option
  lets the Recent Exports re-download path avoid double-counting. Adds
  `bytesToBase64()` / `blobToBase64()` helpers (chunked to avoid stack
  overflow).

- `src/ui/toolbar.ts`: new "Recent Exports" section in the Export
  dropdown. Renders an entry per inbox blob with a source badge, filename,
  size, and relative timestamp. Clicking re-downloads the same blob via
  `downloadBlob(..., { register: false })`. Includes a "Clear" link and
  hides the section when the inbox is empty. Subscribes to inbox changes
  so the UI stays live; re-renders timestamps when the dropdown opens.

- `src/main.ts`:
  - New `partwrightAPI` methods that return file contents inline so AI
    agents can bypass file dialogs:
    - `exportGLBData()`, `exportSTLData()`, `exportOBJData()`,
      `export3MFData()` — base64 (or text for plain OBJ).
    - `exportSessionData()` — returns the parsed `.partwright.json` object.
    - `exportCodeData()` — returns the editor source as text.
    - `importSessionData(jsonObjectOrString)` — accept a parsed payload
      directly; reuses the existing import pipeline by extracting
      `importSessionPayload()` and `validateSessionPayload()` helpers
      shared with `handleImportFile()`.
    - `importCodeData(code, language, sessionName?)` — accept inline
      source as a new session.
    - `listRecentExports()` / `getRecentExport(id)` /
      `downloadRecentExport(id)` / `clearRecentExports()`.
  - Each `*Data()` method also registers the blob in the Recent Exports
    inbox so agent-driven exports are visible in the toolbar.
  - `help()` listings updated with all the new methods, pointing at the
    new ai.md anchor.

- `public/ai.md`: new "AI-friendly file I/O" section documenting the
  whole pattern with examples; new TOC entry; quick-reference list in
  the Console API block updated to call out the `*Data()` variants and
  recommend them for agent flows.

## Verification

- `npm run build` clean, no TypeScript errors.
- Playwright smoke test: hit `/editor?view=ai`, ran every new method on
  the default cube. All 12 methods present. STL/OBJ/GLB/3MF/session/code
  exports return correct mime types and sizes. GLB base64 starts with
  `Z2xURg` (decodes to "glTF" magic). OBJ returns `text` (no colors
  painted in the smoke session). Round-tripped a session via
  `exportSessionData()` → `importSessionData()` and got a new sessionId.
  Recent Exports list shows all entries with badges + relative times;
  `downloadRecentExport(id)` triggered an actual browser download
  without adding a duplicate inbox entry; `clearRecentExports()` empties
  it and hides the toolbar section.
- Bad-payload import paths return helpful `{error}` messages
  ("payload missing partwright/mainifold brand…", "could not parse
  string as JSON").
