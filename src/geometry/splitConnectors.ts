// Connector geometry for split-for-printing cuts. When a model is sliced along a
// plane into two halves, these builders produce the registration hardware that
// joins the printed pieces back together: dowel holes, integral pegs/sockets,
// bolt-and-nut pockets, or a self-locking dovetail key. Each call builds ONE
// connector at a world `point` on the cut plane, with its axis along the plane
// `normal`.
//
// Each recipe is constructed in a local +Z frame centered on the cut plane at
// the origin (local t along +Z, t=0 = plane, t>0 = positive side, t<0 =
// negative side), then `orient()` aligns local +Z to the normal and translates
// to the world point. The caller decides what to do with each returned piece:
// drill from both halves, union into the positive half, or subtract from the
// negative half.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Manifold = any;

export type ConnectorType = 'none' | 'dowel' | 'peg' | 'screw' | 'dovetail';

export interface ConnectorSpec {
  type: ConnectorType;
  diameter?: number;   // dowel/peg shaft & screw shaft (mm), default 5
  depth?: number;      // how far the connector reaches into each side (mm), default 8
  width?: number;      // dovetail key width (mm), default 12
  clearance?: number;  // assembly fit clearance (mm), default 0.2
}

// "positive" side = the side the plane normal points toward.
export interface ConnectorGeometry {
  drillBoth?: Manifold;   // subtract from BOTH halves
  addPositive?: Manifold; // union into the positive half
  subNegative?: Manifold; // subtract from the negative half
}

type Vec3 = [number, number, number];

/** Coerce a maybe-supplied numeric param to a sane positive, else the default. */
function pos(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Unit-length a vector; throws if it is degenerate (~zero length). */
function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 1e-9)) throw new Error('buildConnector: normal must be non-zero');
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Rotate a +Z-built, plane-centered manifold so local +Z maps to `normal`,
 *  then translate it to the world `point`. */
function orient(g: Manifold, normal: Vec3, point: Vec3): Manifold {
  const n = normalize(normal);
  const theta = Math.acos(Math.max(-1, Math.min(1, n[2]))) * 180 / Math.PI; // tilt from +Z
  const phi = Math.atan2(n[1], n[0]) * 180 / Math.PI;                       // azimuth
  return g.rotate([0, theta, 0]).rotate([0, 0, phi]).translate(point);
}

/** A dowel hole through both halves: subtract from each side, insert a rod. */
function dowel(M: any, d: number, depth: number, clr: number): ConnectorGeometry {
  const r = d / 2 + clr;
  const drillBoth = M.cylinder(2 * depth, r, r, 24).translate([0, 0, -depth]);
  return { drillBoth };
}

/** A solid peg on the positive half mating a slightly oversized socket. */
function peg(M: any, d: number, depth: number, clr: number): ConnectorGeometry {
  const addPositive = M.cylinder(depth, d / 2, d / 2, 24).translate([0, 0, -depth]);
  const subNegative = M.cylinder(depth + 0.01, d / 2 + clr, d / 2 + clr, 24).translate([0, 0, -depth]);
  return { addPositive, subNegative };
}

/** A through-bolt: shaft + head counterbore (positive) + hex nut pocket (negative). */
function screw(M: any, d: number, depth: number, clr: number): ConnectorGeometry {
  const shaft = M.cylinder(2 * depth + 4, d / 2 + clr, d / 2 + clr, 24).translate([0, 0, -depth - 2]);
  const counterbore = M.cylinder(depth, d, d, 24); // t∈[0, depth] on the positive side
  const nutPocket = M.cylinder(depth, d, d, 6).translate([0, 0, -depth]); // hex, t∈[−depth, 0]
  const drillBoth = shaft.add(counterbore).add(nutPocket);
  return { drillBoth };
}

/** A tapered dovetail key (positive) and its clearance socket (negative) that
 *  lock the halves against pulling apart along the normal. */
function dovetail(M: any, w: number, depth: number, clr: number): ConnectorGeometry {
  const addPositive = M.hull([
    M.cube([w * 0.6, w, 0.02], true).translate([0, 0, 0]),     // narrow at the plane
    M.cube([w, w, 0.02], true).translate([0, 0, -depth]),      // wide into the negative side
  ]);
  const subNegative = M.hull([
    M.cube([w * 0.6 + 2 * clr, w + 2 * clr, 0.02], true).translate([0, 0, 0.01]),
    M.cube([w + 2 * clr, w + 2 * clr, 0.02], true).translate([0, 0, -depth]),
  ]);
  return { addPositive, subNegative };
}

/** Build one connector at a world `point` on a cut plane whose unit `normal`
 *  becomes the connector axis. Returns null for type 'none'. */
export function buildConnector(
  module: any,
  point: Vec3,
  normal: Vec3,
  spec: ConnectorSpec,
): ConnectorGeometry | null {
  const { Manifold } = module;
  const d = pos(spec.diameter, 5);
  const depth = pos(spec.depth, 8);
  const clr = pos(spec.clearance, 0.2);
  const w = pos(spec.width, 12);

  let local: ConnectorGeometry;
  switch (spec.type) {
    case 'none':
      return null;
    case 'dowel':
      local = dowel(Manifold, d, depth, clr);
      break;
    case 'peg':
      local = peg(Manifold, d, depth, clr);
      break;
    case 'screw':
      local = screw(Manifold, d, depth, clr);
      break;
    case 'dovetail':
      local = dovetail(Manifold, w, depth, clr);
      break;
    default:
      throw new Error(`buildConnector: unknown connector type "${(spec as ConnectorSpec).type}"`);
  }

  const out: ConnectorGeometry = {};
  if (local.drillBoth) out.drillBoth = orient(local.drillBoth, normal, point);
  if (local.addPositive) out.addPositive = orient(local.addPositive, normal, point);
  if (local.subNegative) out.subNegative = orient(local.subNegative, normal, point);
  return out;
}
