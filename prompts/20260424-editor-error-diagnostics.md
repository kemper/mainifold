---
session: "editor-error-diagnostics"
timestamp: "2026-04-24T18:40:00Z"
model: gpt-5-codex
tools: [codex-cli, playwright]
---

## Human

User noted that syntax errors currently appear only as a small message
above the editor, making it hard to tell where the error is or how to fix
it. After an investigation, user asked to create a branch from the latest
`staging`, implement the recommendation, and open a PR for deployment
testing.

## Approach

Added structured source diagnostics alongside the existing string error
messages so existing console API callers keep working while the editor can
show precise locations:

- `SourceDiagnostic` type on engine validation/run results
- JS syntax diagnostics derived from the CodeMirror JavaScript parser
- OpenSCAD diagnostics parsed from compiler stderr line references
- runtime diagnostics with hints, but no misleading editor marker when no
  source location is available

## UI

Integrated `@codemirror/lint` in the editor:

- lint gutter markers
- red inline ranges for located errors
- automatic reveal/selection of the first diagnostic after a failed run
- diagnostics clear on edit or successful run

Added an editor error panel under the editor header with a short summary,
location, full error output, and a focused hint. The compact status label
now shows summaries like `Syntax error on line 2:11` instead of the full
truncated exception.

## Verification

Validated with:

- `npm run build`
- `git diff --check`
- Playwright browser checks for:
  - JavaScript syntax errors showing a line/column, panel, gutter marker,
    inline range, and API diagnostics
  - successful JavaScript run clearing the panel and diagnostics
  - no editor marker for non-located runtime errors
  - OpenSCAD syntax errors returning line diagnostics and showing editor
    markers/panel output
