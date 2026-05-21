// Tolerance-based mesh reduction for imported geometry, backed by manifold-3d's
// `simplify(tolerance)` (removes vertices where the surface moves by less than
// the tolerance). It is great for over-tessellated CAD/printed STLs with flat
// regions; it is NOT a target-triangle decimator, so it won't aggressively thin
// smoothly curved scans without distorting them.

import { getModule } from '../geometry/engine';
import { bboxFromMesh } from '../geometry/statsComputation';
import type { MeshData } from '../geometry/types';

/** Bounding-box diagonal of a mesh, used to express simplify tolerances as a
 *  scale-independent fraction of the model's size. */
export function meshDiagonal(mesh: MeshData): number {
  const bb = bboxFromMesh(mesh);
  if (!bb) return 0;
  return Math.hypot(
    bb.max[0] - bb.min[0],
    bb.max[1] - bb.min[1],
    bb.max[2] - bb.min[2],
  );
}

/** Return a copy of `mesh` simplified to the given absolute tolerance. Falls
 *  back to the original mesh when the engine isn't ready, the tolerance is
 *  non-positive, or simplify throws (e.g. on non-manifold input). */
export function simplifyMesh(mesh: MeshData, tolerance: number): MeshData {
  const mod = getModule();
  if (!mod || !(tolerance > 0)) return mesh;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = null;
  try {
    m = mod.Manifold.ofMesh({
      numProp: mesh.numProp,
      vertProperties: mesh.vertProperties,
      triVerts: mesh.triVerts,
    });
    s = m.simplify(tolerance);
    const out = s.getMesh();
    return {
      numProp: out.numProp,
      vertProperties: out.vertProperties,
      triVerts: out.triVerts,
      numVert: out.numVert,
      numTri: out.numTri,
    };
  } catch {
    return mesh;
  } finally {
    try { s?.delete?.(); } catch { /* already gone */ }
    try { m?.delete?.(); } catch { /* already gone */ }
  }
}
