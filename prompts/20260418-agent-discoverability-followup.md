---
session: "agent-discoverability-followup"
timestamp: "2026-04-18T21:15:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

The modeler AI provided a 12-point feedback document on agent discoverability gaps. Most items were already addressed by PR #16. The user asked me to evaluate the feedback, then implement the remaining worthwhile improvements.

## Assessment

Of the 12 proposed changes, 8 were already implemented. Three were recommended:
1. Add /ai, /agent, /api redirects to /ai.md
2. Add agentHints field to getSessionContext() with recentErrors tracking
3. Improve the "must return a Manifold" error message with a docs link

Three were rejected:
- Auto-return bare expressions (risky AST rewriting)
- Expose raw CodeMirror view (invites the behavior we're preventing)
- ?agent=1 query param with UI dimming (over-engineered, ?view=ai already exists)

## Changes

- `public/_redirects`: Add /ai, /agent, /api -> /ai.md 301 redirects
- `src/storage/sessionManager.ts`: Add error ring buffer (last 5 errors) and agentHints field to SessionContext type and getSessionContext() return value
- `src/main.ts`: Import recordError, call it on execution failures in executeIsolated() and runCodeSync()
- `src/geometry/engine.ts`: Append "/ai.md#before-you-start" link to missing-return error message
- `public/ai.md`: Document agentHints in API reference and resuming-a-session sections
- `CLAUDE.md`: Document agentHints in getSessionContext() examples
