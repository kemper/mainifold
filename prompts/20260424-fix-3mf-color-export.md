---
session: "fix-3mf-colors"
timestamp: "2026-04-24T16:45:00Z"
model: claude-opus-4-6
tools: [claude-in-chrome, browser-testing]
---

## Human

3MF export doesn't preserve colors in viewers.

## Assistant

### Key decisions

The 3MF XML was technically correct but most viewers need **every** triangle to have a material assignment (`pid` attribute), not just the painted ones. Unpainted triangles had no `pid` so viewers ignored the color data entirely.

Fix: added a default base color (`#4a9eff`) at material index 0, assigned `pid="2" p1="0"` to all unpainted triangles, and set `pid="2" pindex="0"` on the `<object>` element as a fallback default. Now every triangle in a colored export has a material.
