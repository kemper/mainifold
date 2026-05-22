// Code generation for the click-to-insert shape & operation palette.
//
// Pure, dependency-free string builders so they can be unit-tested in Node
// (see tests/insert-codegen.spec.ts) the same way src/ai/patch.ts is. Nothing
// here touches the DOM, the editor, or the engine — callers wire the output
// into the editor via the insert controller.
//
// Two target languages share one spec shape:
//   - manifold-js: each primitive is a `const <name> = Manifold...;` so later
//     operations can reference it by name and a final `return` can be managed.
//   - OpenSCAD: each primitive is a statement (optionally wrapped in
//     `translate(...)`), tagged with a `// part: <name>` comment so the
//     operand scanner can list it (SCAD has no geometry variables).

export type InsertLanguage = 'manifold-js' | 'scad';
export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone';
export type BooleanOpKind = 'union' | 'subtract' | 'intersect';

export type Vec3 = [number, number, number];

interface Common {
  /** Identifier (JS variable / SCAD comment tag). Sanitized by the caller. */
  name: string;
  /** World translation applied after construction. Omitted/zero → none. */
  position?: Vec3;
}

export type PrimitiveSpec =
  | (Common & { kind: 'cube'; size: Vec3; center: boolean })
  | (Common & { kind: 'sphere'; radius: number })
  | (Common & { kind: 'cylinder'; height: number; radius: number; center: boolean })
  | (Common & {
      kind: 'cone';
      height: number;
      radiusBottom: number;
      radiusTop: number;
      center: boolean;
    });

/** A shape the operand picker can reference, recovered by scanning the code. */
export interface PartRef {
  /** JS variable name, or SCAD comment tag / synthesized label. */
  name: string;
  /** SCAD only — the full statement text so it can be moved into an op block. */
  statement?: string;
  /** SCAD only — character range of the statement in the source. */
  range?: { from: number; to: number };
}

const OP_METHOD: Record<BooleanOpKind, string> = {
  union: 'add',
  subtract: 'subtract',
  intersect: 'intersect',
};

const OP_SCAD: Record<BooleanOpKind, string> = {
  union: 'union',
  subtract: 'difference',
  intersect: 'intersection',
};

/** Format a number for source: trim to 4 decimals, drop trailing zeros, and
 *  normalize -0 → 0 so generated code stays clean. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e4) / 1e4;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return String(normalized);
}

function vec(v: Vec3): string {
  return `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;
}

function isZero(v?: Vec3): boolean {
  return !v || (v[0] === 0 && v[1] === 0 && v[2] === 0);
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const BASE_NAME: Record<PrimitiveKind, string> = {
  cube: 'box',
  sphere: 'ball',
  cylinder: 'cyl',
  cone: 'cone',
};

export function baseNameFor(kind: PrimitiveKind): string {
  return BASE_NAME[kind];
}

/** Turn an arbitrary user string into a safe JS identifier (also fine as a
 *  SCAD tag). Falls back to `part` when nothing usable remains. */
export function sanitizeName(raw: string): string {
  let s = (raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (s && /^[0-9]/.test(s)) s = `_${s}`;
  return s || 'part';
}

/** Pick `base`, `base2`, `base3`, … avoiding everything in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Build the manifold-js construction expression (no trailing `;`), including
 *  any centering/position translate. Assumes `Manifold` is in scope — the
 *  controller guarantees the destructure line exists. */
function jsPrimitiveExpr(spec: PrimitiveSpec): string {
  let expr: string;
  let centerShift: Vec3 = [0, 0, 0];

  switch (spec.kind) {
    case 'cube':
      expr = `Manifold.cube(${vec(spec.size)}, ${spec.center})`;
      break;
    case 'sphere':
      expr = `Manifold.sphere(${fmt(spec.radius)})`;
      break;
    case 'cylinder':
      expr = `Manifold.cylinder(${fmt(spec.height)}, ${fmt(spec.radius)})`;
      // manifold cylinders sit base-on-origin (z: 0→h); emulate `center`.
      if (spec.center) centerShift = [0, 0, -spec.height / 2];
      break;
    case 'cone':
      expr = `Manifold.cylinder(${fmt(spec.height)}, ${fmt(spec.radiusBottom)}, ${fmt(spec.radiusTop)})`;
      if (spec.center) centerShift = [0, 0, -spec.height / 2];
      break;
  }

  const shift: Vec3 = [
    (spec.position?.[0] ?? 0) + centerShift[0],
    (spec.position?.[1] ?? 0) + centerShift[1],
    (spec.position?.[2] ?? 0) + centerShift[2],
  ];
  if (!isZero(shift)) expr += `.translate(${vec(shift)})`;
  return expr;
}

/** manifold-js: `const <name> = <expr>;` */
export function emitPrimitiveJs(spec: PrimitiveSpec): string {
  return `const ${spec.name} = ${jsPrimitiveExpr(spec)};`;
}

/** OpenSCAD construction call (no translate, no trailing `;`). */
function scadPrimitiveCall(spec: PrimitiveSpec): string {
  switch (spec.kind) {
    case 'cube':
      return `cube(${vec(spec.size)}, center=${spec.center})`;
    case 'sphere':
      return `sphere(r=${fmt(spec.radius)})`;
    case 'cylinder':
      return `cylinder(h=${fmt(spec.height)}, r=${fmt(spec.radius)}, center=${spec.center})`;
    case 'cone':
      return `cylinder(h=${fmt(spec.height)}, r1=${fmt(spec.radiusBottom)}, r2=${fmt(spec.radiusTop)}, center=${spec.center})`;
  }
}

/** OpenSCAD: `translate([...]) <call>; // part: <name>` */
export function emitPrimitiveScad(spec: PrimitiveSpec): string {
  const call = scadPrimitiveCall(spec);
  const body = isZero(spec.position) ? `${call};` : `translate(${vec(spec.position!)}) ${call};`;
  return `${body} // part: ${spec.name}`;
}

export function emitPrimitive(spec: PrimitiveSpec, lang: InsertLanguage): string {
  return lang === 'scad' ? emitPrimitiveScad(spec) : emitPrimitiveJs(spec);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** manifold-js: `const <result> = a.<method>(b).<method>(c);`
 *  `subtract` removes every later operand from the first. */
export function emitOperationJs(op: BooleanOpKind, operands: string[], resultName: string): string {
  if (operands.length < 2) {
    throw new Error('emitOperationJs: need at least two operands');
  }
  const method = OP_METHOD[op];
  const chain = operands.slice(1).map(o => `.${method}(${o})`).join('');
  return `const ${resultName} = ${operands[0]}${chain};`;
}

/** OpenSCAD: wrap operand *statements* in a `union(){}`/`difference(){}`/
 *  `intersection(){}` block. `operands` are statement strings (the geometry),
 *  not names. The `// part:` tag is moved onto the block so the result is
 *  itself selectable. */
export function emitOperationScad(op: BooleanOpKind, operands: string[], resultName: string): string {
  if (operands.length < 2) {
    throw new Error('emitOperationScad: need at least two operands');
  }
  const block = OP_SCAD[op];
  const children = operands
    .map(stmt => stmt.replace(/\s*\/\/ part:.*$/, '').trim())
    .map(stmt => `  ${stmt}`)
    .join('\n');
  return `${block}() { // part: ${resultName}\n${children}\n}`;
}

// ---------------------------------------------------------------------------
// Operand discovery (scanning existing code)
// ---------------------------------------------------------------------------

/** manifold-js: list top-level `const <id> = ...` declarations. Best-effort
 *  (regex, not a full parser) — enough to populate the operand picker, and it
 *  re-derives from the live code each call so renames/deletes self-correct. */
export function scanPartsJs(code: string): PartRef[] {
  const out: PartRef[] = [];
  const seen = new Set<string>();
  // Match `const name =` / `let name =` at the start of a (possibly indented)
  // line. Skip the destructure line (`const { Manifold } = api`).
  const re = /^[ \t]*(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name });
  }
  return out;
}

/** OpenSCAD: split into top-level statements (respecting braces, strings, and
 *  comments) and surface each as a part. A trailing `// part: <name>` comment
 *  supplies the label; otherwise the statement text itself is the label. */
export function scanPartsScad(code: string): PartRef[] {
  const out: PartRef[] = [];
  for (const stmt of splitTopLevelScad(code)) {
    const tag = /\/\/ part:\s*([^\n]+)$/.exec(stmt.text.trim());
    const name = tag ? tag[1].trim() : summarizeStatement(stmt.text);
    out.push({ name, statement: stmt.text, range: { from: stmt.from, to: stmt.to } });
  }
  return out;
}

export function scanParts(code: string, lang: InsertLanguage): PartRef[] {
  return lang === 'scad' ? scanPartsScad(code) : scanPartsJs(code);
}

interface ScadStatement {
  text: string;
  from: number;
  to: number;
}

/** Walk SCAD source and split it into top-level statements. A statement ends
 *  at a top-level `;` or at the `}` that closes a top-level `{...}` block.
 *  Tracks string and comment state so punctuation inside them is ignored. */
export function splitTopLevelScad(code: string): ScadStatement[] {
  const out: ScadStatement[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const n = code.length;

  const pushStmt = (end: number) => {
    const raw = code.slice(start, end);
    if (raw.trim().length > 0) out.push({ text: raw.trim(), from: start, to: end });
    start = end;
  };

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    // Line comment
    if (c === '/' && next === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }
    // Block comment
    if (c === '/' && next === '*') {
      const close = code.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    // String
    if (c === '"') {
      i++;
      while (i < n && code[i] !== '"') {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth = Math.max(0, depth - 1);
      i++;
      if (depth === 0) {
        // Include any trailing `// part:` comment on the same line.
        const restStart = i;
        const nl = code.indexOf('\n', restStart);
        const lineEnd = nl === -1 ? n : nl;
        const trailing = code.slice(restStart, lineEnd);
        if (/^\s*(\/\/[^\n]*)?$/.test(trailing)) i = lineEnd;
        pushStmt(i);
      }
      continue;
    }
    if (c === ';' && depth === 0) {
      i++;
      // Pull a trailing same-line comment into this statement.
      const restStart = i;
      const nl = code.indexOf('\n', restStart);
      const lineEnd = nl === -1 ? n : nl;
      const trailing = code.slice(restStart, lineEnd);
      if (/^\s*\/\/[^\n]*$/.test(trailing)) i = lineEnd;
      pushStmt(i);
      continue;
    }
    i++;
  }
  // Trailing non-terminated remainder (rare; ignore pure whitespace).
  if (start < n && code.slice(start).trim().length > 0) {
    out.push({ text: code.slice(start).trim(), from: start, to: n });
  }
  return out;
}

function summarizeStatement(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 37)}…` : oneLine;
}
