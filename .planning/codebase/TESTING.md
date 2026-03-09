# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Runner:**
- No test framework is configured
- No test runner (Jest, Vitest, Mocha, etc.) in `package.json` dependencies
- No test script in `package.json` `scripts` section
- No test config file (`jest.config.*`, `vitest.config.*`, etc.) exists

**Assertion Library:**
- None installed

**Run Commands:**
```bash
# No test commands available
npm run build              # Only validation is TypeScript compilation (tsc)
```

## Test File Organization

**Location:**
- No test files exist in the project source (`src/`)
- No `__tests__/`, `test/`, or `tests/` directories
- No `*.test.ts`, `*.spec.ts`, or `*.test.tsx` files

## Current Validation Strategy

The project relies on alternative validation mechanisms instead of traditional unit/integration tests:

**TypeScript Compiler (`tsc`):**
- The build script (`npm run build`) runs `tsc && vite build`
- Strict mode catches type errors: `strict: true`, `noUnusedLocals`, `noUnusedParameters`
- This is the only automated validation before deployment

**Runtime Geometry Assertions (in-browser):**
- The `mainifold.runAndAssert(code, assertions)` API provides runtime validation of 3D geometry:
  ```typescript
  // Located in src/main.ts, checkAssertions() function (line 199)
  interface GeometryAssertions {
    minVolume?: number;
    maxVolume?: number;
    isManifold?: boolean;
    maxComponents?: number;
    genus?: number;
    minGenus?: number;
    maxGenus?: number;
    minBounds?: [number, number, number];
    maxBounds?: [number, number, number];
    minTriangles?: number;
    maxTriangles?: number;
    boundsRatio?: {
      widthToDepth?: [number, number];
      widthToHeight?: [number, number];
      depthToHeight?: [number, number];
    };
  }
  ```
- This is designed for AI agents to validate geometry output, not for automated testing

**Runtime Error Enhancement:**
- `src/geometry/engine.ts` (line 64-81) enhances WASM error messages with actionable hints
- Pattern-matching on error strings to add context about common mistakes

**Manual/Visual Verification:**
- Elevation views (`?view=elevations`) for visual comparison against reference images
- Cross-section slicing (`mainifold.sliceAtZ()`) for structural verification
- Component decomposition (`mainifold.runAndExplain()`) for debugging boolean operations
- Gallery view for comparing design iterations side-by-side

## CI/CD Pipeline

**Configuration:** `.github/workflows/deploy.yml`

**Pipeline steps:**
1. Checkout code
2. Setup Node.js 20
3. `npm ci` (install dependencies)
4. `npm run build` (runs `tsc && vite build` -- type checking + bundle)
5. Upload and deploy to GitHub Pages

**No test step in CI.** The pipeline only validates that TypeScript compiles and Vite can build.

## Mocking

**Framework:** Not applicable (no tests)

**If adding tests, suggested mocking targets:**
- `manifold-3d` WASM module (heavy dependency, requires SharedArrayBuffer)
- IndexedDB for `src/storage/db.ts` (use `fake-indexeddb` or similar)
- Three.js WebGL renderer for `src/renderer/` modules
- `window.location` / `history.replaceState` for URL state management
- `document.createElement` / DOM APIs for UI modules

## Coverage

**Requirements:** None enforced

**No coverage tool configured.**

## Test Types

**Unit Tests:**
- Not implemented
- Good candidates for unit testing:
  - `src/geometry/engine.ts` -- `executeCode()` function (requires WASM mock)
  - `src/geometry/crossSection.ts` -- `sliceAtZ()`, `getBoundingBox()` functions
  - `src/storage/db.ts` -- all CRUD operations (requires IndexedDB mock)
  - `src/storage/sessionManager.ts` -- state management logic
  - `src/export/stl.ts`, `src/export/obj.ts`, `src/export/threemf.ts` -- binary/text format generation
  - `src/main.ts` -- `checkAssertions()`, `computeStatDiff()`, `simpleHash()` pure functions

**Integration Tests:**
- Not implemented
- Good candidates:
  - Session lifecycle: create session -> save versions -> navigate -> export -> import
  - Code execution -> geometry stats -> cross-section pipeline
  - URL state synchronization

**E2E Tests:**
- Not implemented
- Playwright or Puppeteer would be appropriate given the browser-based architecture
- Requires COEP/COOP headers for SharedArrayBuffer (configured in `vite.config.ts`)
- The `window.mainifold` console API provides a natural E2E test interface

## Recommended Test Setup

If adding tests, use Vitest (already Vite-based project):

```bash
npm install -D vitest @vitest/coverage-v8 happy-dom
```

**Config file** (`vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/vite-env.d.ts'],
    },
  },
});
```

**Package.json scripts to add:**
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Recommended test file placement:**
- Co-located with source: `src/geometry/engine.test.ts`, `src/storage/db.test.ts`
- Test data/fixtures: `src/__fixtures__/` or inline in test files

**Priority order for adding tests:**
1. `src/export/stl.ts`, `src/export/obj.ts` -- pure data transformation, easy to test
2. `src/storage/db.ts` -- critical data persistence logic
3. `src/storage/sessionManager.ts` -- state management with pub/sub
4. `src/main.ts` pure functions -- `checkAssertions()`, `computeStatDiff()`, `simpleHash()`
5. `src/geometry/crossSection.ts` -- requires WASM mock but geometrically important

---

*Testing analysis: 2026-03-09*
