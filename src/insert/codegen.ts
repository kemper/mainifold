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
export type PrimitiveKind =
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'tube'
  | 'wedge'
  | 'pyramid'
  | 'polygon'
  | 'hemisphere'
  | 'tetrahedron'
  | 'star';
export type BooleanOpKind = 'union' | 'subtract' | 'intersect';
export type MirrorAxis = 'x' | 'y' | 'z';

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
    })
  | (Common & {
      kind: 'torus';
      majorRadius: number;
      tubeRadius: number;
      segments: number;
    })
  | (Common & {
      kind: 'tube';
      height: number;
      outerRadius: number;
      innerRadius: number;
      center: boolean;
    })
  | (Common & { kind: 'wedge'; size: Vec3; center: boolean })
  | (Common & {
      kind: 'pyramid';
      baseSize: number;
      height: number;
      center: boolean;
    })
  | (Common & {
      kind: 'polygon';
      sides: number;
      radius: number;
      height: number;
      center: boolean;
    })
  | (Common & { kind: 'hemisphere'; radius: number; center: boolean })
  | (Common & { kind: 'tetrahedron'; size: number })
  | (Common & {
      kind: 'star';
      points: number;
      outerRadius: number;
      innerRadius: number;
      height: number;
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
  torus: 'torus',
  tube: 'tube',
  wedge: 'wedge',
  pyramid: 'pyramid',
  polygon: 'prism',
  hemisphere: 'dome',
  tetrahedron: 'tet',
  star: 'star',
};

/** Vertices of a regular n-gon inscribed in a circle of given radius,
 *  starting at angle 0 and going counter-clockwise. */
export function ringPoints(sides: number, radius: number): [number, number][] {
  const n = Math.max(3, Math.floor(sides));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return out;
}

/** 2n vertices alternating outer/inner radius for an n-pointed star. */
export function starPoints(points: number, outer: number, inner: number): [number, number][] {
  const n = Math.max(3, Math.floor(points));
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

function vec2List(pts: readonly [number, number][]): string {
  return pts.map(p => `[${fmt(p[0])}, ${fmt(p[1])}]`).join(', ');
}

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
    case 'torus':
      // A circle at (X=R, Y=0) revolved around the profile's Y axis (which
      // becomes Z after revolve) produces a torus of major radius R, tube r.
      // Revolved geometry is naturally centered on Z=0.
      expr = `CrossSection.circle(${fmt(spec.tubeRadius)}).translate([${fmt(spec.majorRadius)}, 0]).revolve(${Math.max(3, Math.floor(spec.segments))})`;
      break;
    case 'tube':
      // Outer cylinder minus inner — both share base-on-origin like cylinder.
      expr = `Manifold.cylinder(${fmt(spec.height)}, ${fmt(spec.outerRadius)}).subtract(Manifold.cylinder(${fmt(spec.height)}, ${fmt(spec.innerRadius)}))`;
      if (spec.center) centerShift = [0, 0, -spec.height / 2];
      break;
    case 'wedge': {
      // Right-triangle prism with the right angle at (0, 0) in XY.
      const tri = `[[${fmt(0)}, ${fmt(0)}], [${fmt(spec.size[0])}, ${fmt(0)}], [${fmt(0)}, ${fmt(spec.size[1])}]]`;
      expr = `CrossSection.ofPolygons([${tri}]).extrude(${fmt(spec.size[2])})`;
      if (spec.center) centerShift = [-spec.size[0] / 2, -spec.size[1] / 2, -spec.size[2] / 2];
      break;
    }
    case 'pyramid': {
      // Square base extruded to a point via scaleTop=[0,0]. extrude `center`
      // (last arg) centers along Z; the square is already centered in XY.
      const c = spec.center;
      expr = `CrossSection.square([${fmt(spec.baseSize)}, ${fmt(spec.baseSize)}], true).extrude(${fmt(spec.height)}, 1, 0, [0, 0], ${c})`;
      break;
    }
    case 'polygon': {
      const pts = ringPoints(spec.sides, spec.radius);
      expr = `CrossSection.ofPolygons([[${vec2List(pts)}]]).extrude(${fmt(spec.height)})`;
      if (spec.center) centerShift = [0, 0, -spec.height / 2];
      break;
    }
    case 'hemisphere': {
      // Sphere ∩ cube halfspace; cube spans Z=0..2R so the dome covers Z=0..R.
      const R = spec.radius;
      expr = `Manifold.sphere(${fmt(R)}).intersect(Manifold.cube([${fmt(2 * R)}, ${fmt(2 * R)}, ${fmt(2 * R)}], true).translate([0, 0, ${fmt(R)}]))`;
      if (spec.center) centerShift = [0, 0, -R / 2];
      break;
    }
    case 'tetrahedron': {
      // Manifold.tetrahedron() produces a tetrahedron whose vertices are 4
      // alternating corners of the cube [-1,1]^3 (bounding box 2 units edge).
      // Scale by size/2 so `size` matches the bounding-box edge length.
      const s = spec.size / 2;
      expr = `Manifold.tetrahedron()`;
      if (s !== 1) expr += `.scale(${fmt(s)})`;
      break;
    }
    case 'star': {
      const pts = starPoints(spec.points, spec.outerRadius, spec.innerRadius);
      expr = `CrossSection.ofPolygons([[${vec2List(pts)}]]).extrude(${fmt(spec.height)})`;
      if (spec.center) centerShift = [0, 0, -spec.height / 2];
      break;
    }
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

function scadVec2List(pts: readonly [number, number][]): string {
  return pts.map(p => `[${fmt(p[0])}, ${fmt(p[1])}]`).join(', ');
}

/** OpenSCAD construction call (no translate, no trailing `;`). Most kinds emit
 *  a single call; compound shapes (tube, hemisphere, tetrahedron) emit a
 *  brace-delimited block — the SCAD scanner already understands those. */
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
    case 'torus': {
      const seg = Math.max(3, Math.floor(spec.segments));
      return `rotate_extrude($fn=${seg}) translate([${fmt(spec.majorRadius)}, 0, 0]) circle(r=${fmt(spec.tubeRadius)})`;
    }
    case 'tube': {
      const inner = `cylinder(h=${fmt(spec.height + 0.2)}, r=${fmt(spec.innerRadius)}, center=${spec.center})`;
      const innerShift = spec.center ? inner : `translate([0, 0, -0.1]) ${inner}`;
      return `difference() { cylinder(h=${fmt(spec.height)}, r=${fmt(spec.outerRadius)}, center=${spec.center}); ${innerShift}; }`;
    }
    case 'wedge': {
      const tri = `[[0, 0], [${fmt(spec.size[0])}, 0], [0, ${fmt(spec.size[1])}]]`;
      const body = `linear_extrude(${fmt(spec.size[2])}) polygon(${tri})`;
      return spec.center
        ? `translate([${fmt(-spec.size[0] / 2)}, ${fmt(-spec.size[1] / 2)}, ${fmt(-spec.size[2] / 2)}]) ${body}`
        : body;
    }
    case 'pyramid':
      return `linear_extrude(${fmt(spec.height)}, scale=0, center=${spec.center}) square([${fmt(spec.baseSize)}, ${fmt(spec.baseSize)}], center=true)`;
    case 'polygon':
      // SCAD cylinder with $fn is a regular polygon prism (the cheapest path).
      return `cylinder(h=${fmt(spec.height)}, r=${fmt(spec.radius)}, center=${spec.center}, $fn=${Math.max(3, Math.floor(spec.sides))})`;
    case 'hemisphere': {
      const R = spec.radius;
      const cutter = `translate([${fmt(-R)}, ${fmt(-R)}, 0]) cube([${fmt(2 * R)}, ${fmt(2 * R)}, ${fmt(R)}])`;
      const inside = `intersection() { sphere(r=${fmt(R)}); ${cutter}; }`;
      return spec.center ? `translate([0, 0, ${fmt(-R / 2)}]) ${inside}` : inside;
    }
    case 'tetrahedron': {
      // 4 corners of the cube [-s,s]^3 (alternating) form a regular tetrahedron
      // with bounding-box edge 2s, edge length 2s·√2.
      const s = spec.size / 2;
      const pts = `[[${fmt(s)}, ${fmt(s)}, ${fmt(s)}], [${fmt(-s)}, ${fmt(-s)}, ${fmt(s)}], [${fmt(-s)}, ${fmt(s)}, ${fmt(-s)}], [${fmt(s)}, ${fmt(-s)}, ${fmt(-s)}]]`;
      const faces = `[[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]`;
      return `polyhedron(points=${pts}, faces=${faces})`;
    }
    case 'star': {
      const pts = starPoints(spec.points, spec.outerRadius, spec.innerRadius);
      return `linear_extrude(${fmt(spec.height)}, center=${spec.center}) polygon([${scadVec2List(pts)}])`;
    }
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
