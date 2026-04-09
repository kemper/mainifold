---
session: "improve-export-filenames"
timestamp: "2026-04-08T18:53:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Improve export filenames — currently everything downloads as "model.extension". Use session name, add date/unit suffixes, DRY up the download logic, embed metadata in file headers.

## Changes

- `src/export/download.ts` (new): Shared `getExportFilename()` (session name + version + date + units), `getExportTitle()` for file metadata, `downloadBlob()` helper.
- `src/export/gltf.ts`: Use shared download utilities, accept optional `customName` param.
- `src/export/stl.ts`: Use shared download utilities, session name in STL header.
- `src/export/obj.ts`: Use shared download utilities, session name in OBJ comment.
- `src/export/threemf.ts`: Use shared download utilities, session name in 3MF XML metadata.
- `src/main.ts`: Console API export methods accept optional filename override.
