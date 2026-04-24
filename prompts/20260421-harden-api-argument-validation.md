---
session: "harden-api-argument-validation"
timestamp: "2026-04-21T19:00:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

A prior browser AI session misused the `window.mainifold` API, passing an
object where a string was expected. That agent noted the API could reject
wrong types/shapes instead of silently accepting them. User asked for an
investigation and a plan to harden all ~50 API methods, then approved the
full sweep with these choices:

- Skip tests entirely
- Throw on void setters
- Strict reject, no coercion
- Chatty error messages with `/ai.md#anchor` links
- Open a PR off a refreshed `staging` branch

## Investigation

Cataloged every method on `window.mainifold` (main.ts:806+), mapping:
- Current validation state (most methods had none)
- Risk level per method (critical/high/medium/low)
- Existing good patterns (`parseVersionTarget` at main.ts:353)
- Docs that reference the API (`CLAUDE.md`, `public/ai.md`, no tests)
- Error-message style already in use (chatty, /ai.md anchor links)

Found ~50 methods needing hardening, grouped into 5 risk tiers.

## Decisions

- **Inline helpers, no dependencies.** Added `assertString`, `assertNumber`,
  `assertBoolean`, `assertObject`, `assertFunction`, `assertEnum`,
  `assertNumberTuple`, `assertArray`, `assertNoUnknownKeys`, and
  `validateAssertionsShape` near the existing `parseVersionTarget`. Zero new
  npm deps — matches the project's minimal-footprint philosophy.
- **Two failure modes.** Value-returning methods return `{ error: "..." }`
  (matches the existing convention). Void setters throw `ValidationError`
  so misuse is loud.
- **No coercion.** `setClipZ("5")` throws. `"5"` is not a number.
- **Reject unknown keys.** `runAndAssert(code, { widthToDeep: [1,2] })`
  rejects the typo rather than silently ignoring it.
- **Helper: `guard(fn)`.** Wraps assertion calls in value-returning methods
  so a `ValidationError` becomes `{ error }` instead of propagating.

## Scope

Hardened methods across every category: code execution, validation,
inspection, exports, clipping, view rendering, reference images, sessions,
versions, notes, assertions, isolated execution, query/modify, geometry
analysis, measurement, view state, reference geometry, units, help.

Docs updated:
- `public/ai.md` — new "Argument validation" section with the convention
  and concrete rejection examples
- `CLAUDE.md` — short note in the Console API section pointing to ai.md

Skipped: a test harness. User explicitly opted out. Validation errors fail
fast and the error strings are self-describing, so regression risk is
bounded.
