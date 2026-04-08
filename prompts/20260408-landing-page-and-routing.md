---
session: "landing-page-routing"
timestamp: "2026-04-08T13:00:00Z"
model: claude-opus-4-6
tools: [chrome-devtools-mcp]
---

## Human

Add a landing page, help page, and proper path-based routing so new users
understand what mAInifold does. Landing page should show recent sessions.
Help page accessible from a ? icon. AI agent URLs should bypass the landing.
Fix /mainifold (no slash) to redirect. Change "Open Editor" to use
/mainifold/editor path. Fix WASM engine not loading (editor showing
"Loading WASM..." with no code or 3D model).

## Assistant

### Key decisions

**Path-based routing**: Switched from query-param routing (?editor, ?help) to
clean URL paths (/mainifold/, /mainifold/editor, /mainifold/help). Query params
(?view=ai, ?session=, ?gallery, ?notes) remain for editor state.

**Landing page shows before WASM loads**: The landing page renders immediately
from IndexedDB session data. WASM engine init happens in the background. When
user clicks "Open Editor" or a session tile, it awaits engine readiness.

**Resilient init**: Wrapped initEngine() in try/catch so the code editor and
Three.js viewport still initialize even when WASM fails. This prevents the
blank-screen failure mode.

**Vite fs.strict: false**: Required for WASM loading from git worktrees where
node_modules resolves to the original repo path outside the worktree root.

### Files changed

- `src/ui/landing.ts` — New: landing page with hero, CTAs, session tile grid
- `src/ui/help.ts` — New: help page explaining the product and API
- `src/main.ts` — Routing logic, deferred init, resilient WASM loading
- `src/ui/layout.ts` — Tab switching uses /mainifold/editor base path
- `src/ui/toolbar.ts` — Added ? help icon button
- `src/storage/sessionManager.ts` — URL helpers use /mainifold/editor base
- `vite.config.ts` — SPA fallback, non-slash redirect, fs.strict: false
- `index.html` — Removed old #ai-help panel, fixed asset paths
- `CLAUDE.md` — Smoke test checklist, updated URL docs and routing section
- `README.md`, `public/ai.md` — Updated URL references
