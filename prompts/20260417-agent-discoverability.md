---
session: "agent-discoverability"
timestamp: "2026-04-17T23:20:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

Evaluated feedback from two AI agent sessions about API discoverability issues. First agent proposed 12 changes; assessed which were worthwhile and implemented 5. Second agent (Chrome-based, security-conscious) tested the result and gave further feedback across two rounds.

## Changes

### Commit 1: Initial discoverability
- `index.html`: Add hidden `#ai-agent-readme` div as first child of `<body>`
- `public/ai.md`: Add "Before you start" TL;DR section and "Common agent mistakes" list
- `src/main.ts`: Add `mainifold.help(method?)` self-documenting method
- `src/main.ts`: Seed new sessions with a `[WORKFLOW]` note
- `public/llms.txt`: New file following llms.txt convention
- `public/robots.txt`: Add comment directing AI agents to docs

### Commit 2: Refinement (security-conscious agent feedback)
- `index.html`: Shrink banner to pure signpost, add `<meta name="ai-instructions">` tag
- `public/llms.txt`: Expand with quickstart code block and ## Docs section
- `public/ai.md`: Restructure top, fix encoding, fix ports, add sandbox docs, add notes to assertions, flag optional tooling, demote #geometry-data, add session-context mistake
- `src/main.ts`: `help()` returns structured object, console.info one-liner, UI-input warning
- `vite.config.ts`: Middleware for .md/.txt charset=utf-8
- `public/_headers`: Content-Type charset rules for production

### Commit 3: Final polish (second round of agent feedback)
- `public/ai.md`: Fix numbering gap (4->6) in Stat-Based Verification, normalize heading case to sentence case throughout, add "Resuming a session" to TOC
- `src/main.ts`: `help()` method entries now include docs anchors (`{signature, docs}` objects instead of flat strings), per-method lookup returns signature + docs link
