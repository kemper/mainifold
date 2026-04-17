---
session: "agent-discoverability"
timestamp: "2026-04-17T23:20:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

Evaluated feedback from a previous AI agent session about API discoverability issues. The agent proposed 12 changes; I assessed which were worthwhile vs over-engineered and implemented the 5 highest-impact ones.

## Changes

- `index.html`: Add hidden `#ai-agent-readme` div as first child of `<body>` — DOM-snapshot tools surface it immediately
- `public/ai.md`: Add "Before you start" TL;DR section and "Common agent mistakes" list at top of file
- `src/main.ts`: Add `mainifold.help(method?)` self-documenting method with per-method lookup
- `src/main.ts`: Seed new sessions with a `[WORKFLOW]` note via `createSession()` so resuming agents see conventions
- `public/llms.txt`: New file following llms.txt convention, pointing to `/ai.md`
- `public/robots.txt`: Add comment directing AI agents to `/ai.md` and `/llms.txt`
