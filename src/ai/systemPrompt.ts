// System prompt assembly. The base body is `public/ai.md` — the same doc
// the external Claude Code agent reads — and the model sees it via prompt
// caching so we don't pay for it on every turn. A short, generated suffix
// communicates the current toggle state so the model doesn't ask for tools
// it can't call.

import { activeModel, type ChatToggles } from './types';

let aiMdCache: string | null = null;
let aiMdPromise: Promise<string> | null = null;

const PREAMBLE = `You are an AI modeling assistant embedded inside Partwright, a parametric
CAD tool that runs in the user's browser. You drive the app through tools
that wrap window.partwright. Always use a session for user-requested
geometry (do not write to examples/). When you write code, return a
Manifold object — see ai.md below for the full conventions.

Be concise in chat. Long explanations cost tokens the user pays for. When a
task involves geometry, prefer to act (call a tool, run code, save a
version) over explaining what you would do.

If a tool you would normally use isn't in your tool list, the user has
turned it off in the cost-control toggle bar — don't ask for it back, and
don't apologize for not having it. Acknowledge the constraint and continue
with what you can do.

Current Partwright API surface and conventions follow.

`;

/** Loads `/ai.md` once and returns the full body. The doc lives in
 *  public/ai.md and is served at the root by Vite. */
export function loadAiMd(): Promise<string> {
  if (aiMdCache !== null) return Promise.resolve(aiMdCache);
  if (aiMdPromise) return aiMdPromise;
  aiMdPromise = fetch('/ai.md')
    .then(r => {
      if (!r.ok) throw new Error(`/ai.md HTTP ${r.status}`);
      return r.text();
    })
    .then(text => {
      aiMdCache = text;
      return text;
    })
    .catch(err => {
      // Fall back to a stub so the agent can still run if ai.md is missing
      // (e.g. a misconfigured deploy). Logged so it surfaces in dev tools.
      console.warn('Partwright: failed to load /ai.md, using stub:', err);
      aiMdCache = '[ai.md could not be loaded — refer to window.partwright.help() at runtime]';
      return aiMdCache;
    });
  return aiMdPromise;
}

/** Builds the suffix that describes the current toggle state. Generated
 *  per-turn, appended after the cached `ai.md` body. Kept small so the
 *  cache prefix invalidation only affects the very last block. */
export function toggleSuffix(toggles: ChatToggles): string {
  const restrictions: string[] = [];
  if (!toggles.scope.runCode) {
    restrictions.push('You CANNOT run code. Suggest code in chat for the user to run themselves.');
  }
  if (!toggles.scope.saveVersions) {
    restrictions.push('You CANNOT save new versions. Run-and-test is allowed but not commit.');
  }
  if (!toggles.scope.paintFaces) {
    restrictions.push('You CANNOT paint faces / set color regions.');
  }
  if (!toggles.vision.views) {
    restrictions.push('You CANNOT see the rendered model. Reason from code and geometry stats only — do not ask for screenshots.');
  }

  const lines = [
    '',
    '## Session toggle state',
    '',
    `Model: ${activeModel(toggles) ?? '(none picked)'} (provider: ${toggles.provider})`,
    `Auto-retry on tool error: ${toggles.autoRetry}`,
  ];
  if (restrictions.length > 0) {
    lines.push('');
    lines.push('User has restricted you this session:');
    for (const r of restrictions) lines.push(`- ${r}`);
  }
  return lines.join('\n');
}

export function buildSystemPrompt(aiMd: string): string {
  return PREAMBLE + aiMd;
}

/** Local models cap at 4K context. The full `ai.md` is ~15K tokens — it
 *  blows the budget before the user even speaks. This is a hand-tuned
 *  ~1K-token replacement covering the essentials a 1-8B model needs to
 *  drive Partwright: API surface, coordinate system, mandatory `return`,
 *  the session-versioning workflow, and a nudge to use tools instead of
 *  narrating. Tool calling format is appended separately in `local.ts`. */
export function buildLocalSystemPrompt(): string {
  return LOCAL_SYSTEM_PROMPT;
}

const LOCAL_SYSTEM_PROMPT = `You are an AI modeling assistant running inside Partwright, a parametric
CAD tool that runs in the user's browser. You drive the app by emitting
tool calls. Be concise — the user reads your messages and pays for compute.
Prefer acting (calling a tool) over describing what you would do.

## Coordinate system
Right-handed, Z-up. The XY plane is the ground; Z points up. Units are
arbitrary (treat them as mm if the user doesn't say otherwise). Make
shapes overlap by at least 0.5 units to boolean-union correctly.

## The manifold-js API (always available inside code you run)
A function-style API. Code MUST end with \`return manifold;\`.

\`\`\`js
const { Manifold, CrossSection } = api;

// Primitives (centred at origin by default; second arg true centres)
Manifold.cube([w, d, h], true);
Manifold.sphere(r, segments);
Manifold.cylinder(h, rBottom, rTop, segments, true);

// Transforms (return new Manifold, originals unchanged)
shape.translate([x, y, z])
shape.rotate([rx, ry, rz])     // degrees
shape.scale([sx, sy, sz])

// Booleans
Manifold.union([a, b, c])      // or a.add(b)
Manifold.difference([a, b])    // or a.subtract(b)
Manifold.intersection([a, b])  // or a.intersect(b)

// 2D extrusion
const profile = CrossSection.circle(r);
profile.extrude(h);
\`\`\`

Worked example — a smiley face: build a sphere head, subtract two small
sphere "eyes", and union a thin curved cylinder "mouth". Always finish
with \`return result;\`.

## Workflow
1. To write or replace the editor code: call \`setCode\` then \`runAndSave\`.
2. \`runAndSave\` runs the code, validates it returns a Manifold, and
   commits a new version to the gallery. Use it instead of \`runCode\`
   unless the user explicitly asked for a dry run.
3. After saving, call \`getGeometryData\` to read back the triangle count
   and bounding box — useful for sanity-checking large changes.

## Conventions
- One Manifold returned per program. No top-level side effects.
- If a boolean produces extra components (check \`componentCount\`), shapes
  weren't overlapping enough.
- When resuming a session, call \`getSessionContext\` FIRST to read prior
  notes and decisions.

`;
