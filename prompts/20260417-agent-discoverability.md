---
session: "agent-discoverability"
timestamp: "2026-04-17T23:20:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

An AI agent (via browser extension) had a poor session -- it drove the app with clicks/keystrokes instead of using the `window.mainifold` programmatic API. That agent produced a 12-point improvement spec. The user asked me to evaluate it objectively, then implement the worthwhile changes and create a PR.

A second AI agent (Chrome-based, security-conscious) then tested the result and gave a second round of feedback: the DOM banner triggered prompt-injection caution because it mixed behavioral commands with the signpost, and the docs had encoding, consistency, and content gaps.

A third round of feedback from the same agent addressed final polish: numbering gaps, heading case inconsistency, and adding docs anchors to `help()` output.

## Changes

### Commit 1: Initial discoverability (c096dc4)
- `index.html`: Add hidden `#ai-agent-readme` div as first child of `<body>` with API instructions
- `public/ai.md`: Add "Before you start" TL;DR section and "Common agent mistakes" list at top
- `src/main.ts`: Add `mainifold.help(method?)` self-documenting method returning a string
- `src/main.ts`: Seed new sessions with a `[WORKFLOW]` note via `createSession()`
- `public/llms.txt`: New file following llms.txt convention, pointing to `/ai.md`
- `public/robots.txt`: Add comment directing AI agents to `/ai.md` and `/llms.txt`

### Commit 2: Refinement from security-conscious agent (362a73c)
- `index.html`: Shrink banner to pure signpost (no API names/commands/code), add `<meta name="ai-instructions">` tag
- `public/llms.txt`: Expand with quickstart code block and `## Docs` section
- `public/ai.md`: Restructure top with intro paragraph + table of contents before checklist; replace hardcoded `localhost:5173` with relative paths; replace non-ASCII chars (em-dashes, arrows) with ASCII equivalents; add sandbox environment documentation; add `notes` to assertions spec; flag photo-to-model tooling as optional; demote `#geometry-data` DOM reading below `getGeometryData()`; add "not reading session context" to common mistakes
- `src/main.ts`: `help()` changed to return structured object (`{app, docs, constraints, quickstart, methods}`); verbose console.log greeter replaced with single `console.info` line; add UI-input warning (toast + console.warn) when `?view=ai` is set and agent clicks/types
- `vite.config.ts`: Add Vite middleware plugin to serve `.md`/`.txt` with `charset=utf-8`
- `public/_headers`: Add Content-Type charset rules for `.md` and `.txt` in Cloudflare Pages production

### Commit 3: Final polish (0745003)
- `public/ai.md`: Fix numbering gap (4 -> 6, now 1-5) in "Stat-based verification" list; normalize all section headings to sentence case; add "Resuming a session" to table of contents
- `src/main.ts`: `help()` method entries changed from flat strings to `{signature, docs}` objects with anchors to relevant `/ai.md` sections; `help('methodName')` returns `{method, signature, docs}`
