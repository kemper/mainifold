---
session: "agent-discoverability"
timestamp: "2026-04-17T23:20:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

Evaluated feedback from two AI agent sessions about API discoverability issues. First agent proposed 12 changes; assessed which were worthwhile and implemented 5. Second agent (Chrome-based, security-conscious) tested the result and gave further feedback: the banner triggered security caution because it mixed a signpost with behavioral commands, and several documentation polish issues.

## Changes

### Initial commit
- `index.html`: Add hidden `#ai-agent-readme` div as first child of `<body>`
- `public/ai.md`: Add "Before you start" TL;DR section and "Common agent mistakes" list
- `src/main.ts`: Add `mainifold.help(method?)` self-documenting method
- `src/main.ts`: Seed new sessions with a `[WORKFLOW]` note
- `public/llms.txt`: New file following llms.txt convention
- `public/robots.txt`: Add comment directing AI agents to docs

### Follow-up commit (agent feedback)
- `index.html`: Shrink banner to pure signpost (no commands), add `<meta name="ai-instructions">` tag
- `public/llms.txt`: Expand with quickstart code block and ## Docs section
- `public/ai.md`: Restructure top with intro + table of contents, replace hardcoded ports with relative paths, replace non-ASCII chars with ASCII equivalents, add sandbox environment docs, add `notes` to assertions spec, flag photo-to-model tooling as optional, demote #geometry-data DOM reading, add "not reading session context" to common mistakes
- `src/main.ts`: `help()` now returns structured object (not just string), console greeter replaced with concise `console.info`, add UI-input warning toast+console.warn when `?view=ai` is set and agent clicks/types
- `vite.config.ts`: Add middleware to serve .md/.txt with charset=utf-8
- `public/_headers`: Add Content-Type charset rules for .md and .txt files in production
