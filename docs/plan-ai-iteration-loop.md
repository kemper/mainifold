# Plan: AI Agent Iteration Loop Improvements

## Context

mAInifold is an AI-agent-first browser CAD tool. The intended workflow is:

1. An AI agent connects to the app (via DevTools MCP or browser automation)
2. The agent creates a session, writes geometry code, runs it, checks results
3. The agent iterates — improving the model based on geometry stats and visual feedback
4. The agent saves each iteration as a version in the session
5. A human opens the gallery view in the app to review and compare all versions

**What actually happened:** When asked to build a castle with multiple versions in a session, the AI (Claude Code in a terminal) couldn't execute the workflow because it has no browser access. It wrote a JS script file for the user to paste into the browser console instead. This defeats the purpose — the human shouldn't need to run scripts. The AI should drive the entire loop.

**Root causes:**
- No tool to execute JavaScript in the running browser from the CLI
- No way to validate geometry without rendering (e.g., headless WASM execution)
- No feedback during long-running builds (complex boolean operations)
- Building complex models (castle with brick patterns, arched gates) required extensive coordinate math that couldn't be verified without running the code
- Each version was a complete copy of all prior code + additions (massive duplication)

## Current Architecture (for context)

- `src/geometry/engine.ts` — manifold-3d WASM init + sandboxed code execution via `new Function('api', code)`
- `src/main.ts` — wires everything together, exposes `window.mainifold` console API
- `src/storage/db.ts` — IndexedDB storage for sessions and versions
- `src/storage/sessionManager.ts` — state management, URL routing, export/import
- `src/ui/gallery.ts` — grid of version tiles with thumbnails and stats

Key console API methods: `mainifold.run(code)`, `mainifold.runAndSave(code, label)`, `mainifold.createSession(name)`, `mainifold.getGeometryData()`, `mainifold.validate(code)`, `mainifold.getGalleryUrl()`.

The `run()` method returns geometry stats: `{ status, vertexCount, triangleCount, volume, surfaceArea, genus, boundingBox, isManifold, componentCount, crossSections, executionTimeMs }`.

## Improvements

### 1. Headless Geometry Validation (Node.js CLI)

**Problem:** The AI can write geometry code but can't run it to check if it works. The WASM engine currently only runs in the browser.

**Solution:** Create a Node.js script/module that loads manifold-3d WASM directly (no browser, no Three.js) and validates geometry code.

**Implementation approach:**
- manifold-3d already publishes an npm package that works in Node.js
- Create `src/cli/validate.ts` (or `scripts/validate.mjs`) that:
  1. Imports and initializes manifold-3d
  2. Accepts code as a string (stdin, file arg, or module export)
  3. Runs the code in the same sandbox pattern as `engine.ts` (`new Function('api', code)`)
  4. Returns geometry stats as JSON (volume, bounding box, vertex/tri count, manifold status, genus)
  5. Exits with code 0 on success, 1 on error
- The AI agent can call this via the Bash tool: `node scripts/validate.mjs castle-v1.js`
- No rendering, no thumbnails — just geometry validation

**Output format (matches existing `#geometry-data` schema):**
```json
{
  "status": "ok",
  "vertexCount": 2840,
  "triangleCount": 5672,
  "volume": 24500,
  "surfaceArea": 12300,
  "boundingBox": { "min": [-31, -31, 0], "max": [31, 31, 44] },
  "genus": 12,
  "isManifold": true,
  "componentCount": 1,
  "executionTimeMs": 340
}
```

**Why this helps:** The AI can iterate in a tight loop: write code → validate → check stats → fix issues → validate again. No browser needed for the geometry correctness loop. The browser/gallery is only needed for visual review at the end.

**Files to create/modify:**
- Create `scripts/validate.mjs` or `src/cli/validate.ts`
- Reuse the sandbox pattern from `src/geometry/engine.ts`
- Reuse the stats computation from `src/main.ts` (`updateGeometryData` logic)

### 2. Geometry Assertions API

**Problem:** After running code, the AI gets a wall of stats but has to manually reason about whether they're correct. "Is volume 24500 right for a castle? Is genus 12 expected?" There's no structured way to express expectations.

**Solution:** Add `mainifold.runAndAssert(code, assertions)` that runs code and checks geometry properties against expected values.

```javascript
const result = await mainifold.runAndAssert(code, {
  minVolume: 10000,
  maxComponents: 1,
  isManifold: true,
  genus: 0,                    // exact match
  minBounds: [40, 40, 20],     // minimum bounding box dimensions
});
// Returns: { passed: true, stats: {...} }
// Or: { passed: false, failures: ["volume 8500 < minVolume 10000"], stats: {...} }
```

**Assertion options:**
- `minVolume`, `maxVolume` — volume bounds
- `isManifold` — must be a valid manifold (status === 0)
- `maxComponents` — detect failed booleans (extra disconnected pieces)
- `genus` — exact topological genus (0 for solid, N for N through-holes)
- `minBounds`, `maxBounds` — bounding box dimension constraints
- `minTriangles`, `maxTriangles` — mesh complexity bounds

**Implementation:** Thin wrapper around `run()` that compares returned stats against the assertion object. Can be implemented entirely in `main.ts` as part of the `mainifoldAPI` object. Also add it to the CLI validator from improvement #1.

### 3. Stat Diffing Between Versions

**Problem:** When iterating on a model, the AI needs to understand what changed. "I added battlements — did the volume increase? Did I accidentally create disconnected components?"

**Solution:** When `runAndSave()` completes, return a diff against the previous version's stats.

```javascript
const result = await mainifold.runAndSave(code, "v2 - battlements");
// result.diff = {
//   volume: { from: 18200, to: 24500, delta: "+6300 (+34.6%)" },
//   vertexCount: { from: 1200, to: 2840, delta: "+1640" },
//   genus: { from: 0, to: 0, delta: "unchanged" },
//   componentCount: { from: 1, to: 1, delta: "unchanged" },
//   boundingBox: { dimensions: { from: [50,50,30], to: [53,53,33] } }
// }
```

**Implementation:**
- In `runAndSave`, after getting new geometry data, look up the previous version's `geometryData` from the session
- Compute deltas for key numeric fields
- Include the diff in the return value
- Store geometry data on each version (already done — `version.geometryData`)

### 4. Progress Feedback for Long Builds

**Problem:** Complex models with many boolean operations (castle with brick grooves = 50+ unions then a subtract) can take seconds. The AI has no indication whether it's working, hung, or failed. The status bar says "Running..." but the AI can't see the status bar.

**Solution A: Execution timeout with estimate**
- Add an optional `timeout` parameter to `run()` and `runAndSave()`
- Before execution, do a quick static analysis of the code to estimate complexity (count `subtract`, `union`, `add` calls and cylinder segment counts)
- Return the estimate: `{ estimatedComplexity: "high", estimatedTime: "2-5s" }`

**Solution B: Web Worker with progress messages**
- Move code execution to a Web Worker
- The worker posts progress messages: `{ phase: "executing", elapsed: 1200 }`
- Add a `mainifold.getRunStatus()` method that returns the current state
- If the AI is polling (via DevTools MCP), it can check `getRunStatus()` to see if the run is still going

**Solution C (simplest): Just return timing**
- `run()` already returns `executionTimeMs`
- Add a `mainifold.isRunning()` boolean so the AI can check before calling `run()` again
- If a run is in progress, `run()` should either queue or reject with a clear error

**Recommendation:** Start with Solution C (minimal), add Solution A (complexity estimate) later. Solution B (Web Worker) is a bigger architectural change.

### 5. Sub-Model Testing

**Problem:** When building a complex model, the AI writes all the code at once and hopes it works. If the castle has a gate problem, the AI can't isolate and test just the gate.

**Solution:** Document and encourage a pattern of incremental building where the AI:
1. Writes and validates the walls alone → checks stats
2. Adds towers → validates again (volume should increase, still 1 component)
3. Adds gate cut → validates (volume should decrease, genus may change)
4. Each step is a version in the session

This doesn't require code changes — it's a workflow pattern. But it could be supported better:

- **`mainifold.runAndCompare(code, previousCode)`** — runs both, returns stat diff
- **Add a "sub-model testing" section to `ai.md`** explaining the pattern
- **The assertions API (#2) makes this natural:** test walls alone with `minVolume: 5000, maxComponents: 1`, then test walls+towers with `minVolume: 8000`

### 6. Reduce Code Duplication Across Versions

**Problem:** Each version is a complete self-contained script. Version 4 of the castle repeats 100% of version 1-3 code plus additions. This makes the code harder to write, debug, and read.

**Possible solutions:**

**A. Helper module system:**
- Allow `// @import helpers.js` at the top of model code
- The sandbox pre-loads helper functions (e.g., `roundedRect`, `crenellationRing`, `brickGrooves`)
- Versions share helpers but have distinct main code

**B. Parameterized models:**
- The code defines a function with feature flags
- Each version is just different params: `buildCastle({ battlements: true, brickPattern: false })`
- Versions are lightweight

**C. Code inheritance:**
- "Fork from version N" — loads the previous version's code as a starting point
- The session system tracks parent-child relationships between versions
- The gallery shows the diff, not the full code

**Recommendation:** Option C is most natural for the AI iteration workflow. The AI loads v3, modifies it to create v4. The session already supports this implicitly (the AI reads the previous version's code and edits it), but making it explicit would help.

### 7. CLI-to-Browser Bridge for Sessions

**Problem:** Even with headless validation (#1), the AI still can't save versions with thumbnails or populate the gallery without a browser.

**Solution:** Create a CLI tool that:
1. Takes a directory of versioned code files (or a JSON manifest)
2. For each version: validates geometry via headless WASM, generates stats
3. Writes a `.mainifold.json` session export file (the format already exists via `exportSession`)
4. The user imports it in the app, which regenerates thumbnails

This connects to the existing `mainifold.importSession(data)` API and the "Auto-import sessions from filesystem" idea in `improvement-ideas.md`.

**Alternatively:** A headless browser runner (Puppeteer script) that:
1. Launches the app headlessly
2. Calls `mainifold.createSession()`, loops through versions with `mainifold.runAndSave()`
3. Exports the session to a `.mainifold.json` file
4. Shuts down

This is heavier but produces proper thumbnails. Could live at `scripts/run-session.mjs`.

## Priority Order

1. **Headless geometry validation (#1)** — highest impact, unblocks the AI iteration loop without browser dependency. Relatively simple to implement.
2. **Geometry assertions (#2)** — small addition on top of #1, makes validation structured instead of manual stat-reading.
3. **Stat diffing (#3)** — small change to `runAndSave`, very useful for AI self-correction.
4. **CLI-to-browser bridge (#7)** — connects headless validation to the gallery for human review.
5. **Progress feedback (#4)** — quality-of-life, start with `isRunning()`.
6. **Sub-model testing docs (#5)** — free, just documentation.
7. **Code duplication (#6)** — nice to have, lower priority.

## Existing Related Work

- `docs/improvement-ideas.md` — has related ideas: `runIsolated`, batch session creation, session diffing, auto-import from filesystem. The improvements here overlap and extend those ideas.
- `src/storage/sessionManager.ts` — `exportSession()` / `importSession()` already support JSON serialization of sessions. The CLI bridge (#7) should use this format.
- `scripts/log-cabin-session.mjs` — an existing session-building script (created by another AI). May have patterns worth reusing.
- `src/geometry/engine.ts` — the WASM init and sandbox execution logic that needs to be extracted for the headless validator.
