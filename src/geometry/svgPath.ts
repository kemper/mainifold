// SVG path "d" → list of 2D contours for `CrossSection.ofPolygons`.

import { parseSVG, makeAbsolute, type CommandMadeAbsolute } from 'svg-path-parser';
import type { Vec2, FillRule } from 'manifold-3d';

export type { Vec2 };

/** Canonical FillRule list — single source of truth for option validators
 *  on both the console-side and sandbox-side `crossSectionFromSVG`. */
export const FILL_RULES = ['EvenOdd', 'NonZero', 'Positive', 'Negative'] as const satisfies readonly FillRule[];

export interface ParseSVGPathOptions {
  /** Segments per cubic/quadratic curve. Higher = smoother but more
   *  triangles downstream. Default 24. */
  curveSegments?: number;
  /** Segments per quarter-turn of an elliptical arc. Default 16. */
  arcSegments?: number;
  /** Uniform scale applied to all coordinates after parsing. Default 1. */
  scale?: number;
  /** Flip the Y axis so an SVG drawn in browser conventions (y-down)
   *  comes out the right way up in CAD (y-up). Default true. */
  flipY?: boolean;
  /** Discard contours with fewer than this many points after sampling.
   *  Default 3 (a contour must have at least a triangle). */
  minVertices?: number;
}

/** Parse an SVG path "d" string into a flat list of 2D contours. Each
 *  subpath (anything starting with M/m) becomes one contour. Returns
 *  contours in the order they appear in the path — callers using
 *  `CrossSection.ofPolygons` should let the fill rule decide
 *  outer/hole, rather than relying on order. */
export function parseSVGPath(d: string, options: ParseSVGPathOptions = {}): Vec2[][] {
  const curveSegments = options.curveSegments ?? 24;
  const arcSegments = options.arcSegments ?? 16;
  const scale = options.scale ?? 1;
  const flipY = options.flipY ?? true;
  const minVertices = options.minVertices ?? 3;

  const raw = parseSVG(d);
  const commands = makeAbsolute(raw);

  const contours: Vec2[][] = [];
  let current: Vec2[] = [];
  let subpathStart: Vec2 = [0, 0];

  const pushPoint = (x: number, y: number) => {
    if (current.length > 0) {
      const last = current[current.length - 1];
      if (last[0] === x && last[1] === y) return; // dedupe consecutive
    }
    current.push([x, y]);
  };

  const finishSubpath = () => {
    if (current.length > 0) {
      // If closed by Z, the path comes back to the start — drop the
      // trailing duplicate to avoid a zero-length edge.
      if (current.length >= 2) {
        const a = current[0];
        const b = current[current.length - 1];
        if (a[0] === b[0] && a[1] === b[1]) current.pop();
      }
      if (current.length >= minVertices) contours.push(current);
      current = [];
    }
  };

  for (const cmd of commands) {
    switch (cmd.code) {
      case 'M':
        finishSubpath();
        subpathStart = [cmd.x, cmd.y];
        pushPoint(cmd.x, cmd.y);
        break;
      case 'L':
      case 'H':
      case 'V':
        pushPoint(cmd.x, cmd.y);
        break;
      case 'Z':
        pushPoint(subpathStart[0], subpathStart[1]);
        finishSubpath();
        break;
      case 'C':
        sampleCubic(current, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, curveSegments);
        break;
      case 'S':
        sampleSmoothCubic(current, commands, cmd, curveSegments);
        break;
      case 'Q':
        sampleQuadratic(current, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.x, cmd.y, curveSegments);
        break;
      case 'T':
        sampleSmoothQuadratic(current, commands, cmd, curveSegments);
        break;
      case 'A':
        sampleArc(current, cmd.x0, cmd.y0, cmd.x, cmd.y, cmd.rx, cmd.ry, cmd.xAxisRotation, cmd.largeArc, cmd.sweep, arcSegments);
        break;
    }
  }
  finishSubpath();

  if (scale !== 1 || flipY) {
    const sx = scale;
    const sy = flipY ? -scale : scale;
    for (const contour of contours) {
      for (const pt of contour) {
        pt[0] *= sx;
        pt[1] *= sy;
      }
    }
  }
  return contours;
}

function sampleCubic(out: Vec2[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x: number, y: number, segments: number): void {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
    const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
    pushUnique(out, px, py);
  }
}

function sampleSmoothCubic(out: Vec2[], all: CommandMadeAbsolute[], cmd: CommandMadeAbsolute & { code: 'S' }, segments: number): void {
  // Reflect previous control point. svg-path-parser doesn't fill in x1/y1
  // for S, so we look at the prior command.
  const idx = all.indexOf(cmd);
  const prev = idx > 0 ? all[idx - 1] : null;
  let cx1 = cmd.x0;
  let cy1 = cmd.y0;
  if (prev && (prev.code === 'C' || prev.code === 'S')) {
    const px2 = prev.x2;
    const py2 = prev.y2;
    cx1 = 2 * cmd.x0 - px2;
    cy1 = 2 * cmd.y0 - py2;
  }
  sampleCubic(out, cmd.x0, cmd.y0, cx1, cy1, cmd.x2, cmd.y2, cmd.x, cmd.y, segments);
}

function sampleQuadratic(out: Vec2[], x0: number, y0: number, x1: number, y1: number, x: number, y: number, segments: number): void {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x;
    const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y;
    pushUnique(out, px, py);
  }
}

function sampleSmoothQuadratic(out: Vec2[], all: CommandMadeAbsolute[], cmd: CommandMadeAbsolute & { code: 'T' }, segments: number): void {
  const idx = all.indexOf(cmd);
  const prev = idx > 0 ? all[idx - 1] : null;
  let cx1 = cmd.x0;
  let cy1 = cmd.y0;
  if (prev && (prev.code === 'Q' || prev.code === 'T')) {
    // Reflect prior quadratic control point.
    // T-after-T uses the implicit-reflected control of the previous T.
    if (prev.code === 'Q') {
      cx1 = 2 * cmd.x0 - prev.x1;
      cy1 = 2 * cmd.y0 - prev.y1;
    } else {
      // For T-after-T, we don't have a stored implicit; conservatively
      // reflect the endpoint, which produces a smooth path that's close
      // to the SVG spec interpretation.
      cx1 = cmd.x0;
      cy1 = cmd.y0;
    }
  }
  sampleQuadratic(out, cmd.x0, cmd.y0, cx1, cy1, cmd.x, cmd.y, segments);
}

function sampleArc(out: Vec2[], x0: number, y0: number, x: number, y: number, rxIn: number, ryIn: number, xAxisRotationDeg: number, largeArc: boolean, sweep: boolean, segmentsPerQuarter: number): void {
  // Implementation of SVG endpoint→center arc parameterization from
  // https://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
  if (x0 === x && y0 === y) return;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    pushUnique(out, x, y);
    return;
  }
  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p =  cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Scale radii if they aren't big enough to span the chord.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = Math.sqrt(Math.max(0, num / den));

  const cxp =  sign * factor * (rx * y1p) / ry;
  const cyp = -sign * factor * (ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  const totalQuarters = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const segments = Math.max(2, totalQuarters * segmentsPerQuarter);

  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const theta = theta1 + deltaTheta * t;
    const px = cosPhi * (rx * Math.cos(theta)) - sinPhi * (ry * Math.sin(theta)) + cx;
    const py = sinPhi * (rx * Math.cos(theta)) + cosPhi * (ry * Math.sin(theta)) + cy;
    pushUnique(out, px, py);
  }
}

function pushUnique(out: Vec2[], x: number, y: number): void {
  if (out.length > 0) {
    const last = out[out.length - 1];
    if (last[0] === x && last[1] === y) return;
  }
  out.push([x, y]);
}

/** Validate + normalize options for `crossSectionFromSVG`. Used by both
 *  the console-side (window.partwright.crossSectionFromSVG) and the
 *  sandbox-side (api.crossSectionFromSVG) entry points so error messages
 *  stay identical. Returns parsed contours ready for CrossSection.ofPolygons
 *  along with the chosen fill rule. Throws Error on bad input. */
export function parseSVGPathWithOptions(d: unknown, options: unknown, prefix: string): { contours: Vec2[][]; fillRule: FillRule } {
  if (typeof d !== 'string' || d.length === 0) {
    throw new Error(`${prefix}: d must be a non-empty SVG path string`);
  }
  let fillRule: FillRule = 'EvenOdd';
  let parserOpts: ParseSVGPathOptions = {};
  if (options !== undefined) {
    if (!options || typeof options !== 'object') {
      throw new Error(`${prefix}: options must be an object`);
    }
    const o = options as Record<string, unknown>;
    const allowed = ['curveSegments', 'arcSegments', 'scale', 'flipY', 'minVertices', 'fillRule'];
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k)) {
        throw new Error(`${prefix}: unknown option "${k}". Allowed: ${allowed.join(', ')}`);
      }
    }
    if (o.curveSegments !== undefined && (typeof o.curveSegments !== 'number' || !Number.isInteger(o.curveSegments) || o.curveSegments < 1)) {
      throw new Error(`${prefix}.curveSegments: must be a positive integer`);
    }
    if (o.arcSegments !== undefined && (typeof o.arcSegments !== 'number' || !Number.isInteger(o.arcSegments) || o.arcSegments < 1)) {
      throw new Error(`${prefix}.arcSegments: must be a positive integer`);
    }
    if (o.scale !== undefined && typeof o.scale !== 'number') {
      throw new Error(`${prefix}.scale: must be a number`);
    }
    if (o.flipY !== undefined && typeof o.flipY !== 'boolean') {
      throw new Error(`${prefix}.flipY: must be a boolean`);
    }
    if (o.minVertices !== undefined && (typeof o.minVertices !== 'number' || !Number.isInteger(o.minVertices) || o.minVertices < 3)) {
      throw new Error(`${prefix}.minVertices: must be an integer >= 3`);
    }
    if (o.fillRule !== undefined) {
      if (typeof o.fillRule !== 'string' || !(FILL_RULES as readonly string[]).includes(o.fillRule)) {
        throw new Error(`${prefix}.fillRule: must be one of ${FILL_RULES.join(', ')}`);
      }
      fillRule = o.fillRule as FillRule;
    }
    parserOpts = {
      curveSegments: o.curveSegments as number | undefined,
      arcSegments: o.arcSegments as number | undefined,
      scale: o.scale as number | undefined,
      flipY: o.flipY as boolean | undefined,
      minVertices: o.minVertices as number | undefined,
    };
  }
  const contours = parseSVGPath(d, parserOpts);
  if (contours.length === 0) {
    throw new Error(`${prefix}: parsed path produced no contours — check the path syntax and that subpaths are closed with Z`);
  }
  return { contours, fillRule };
}
