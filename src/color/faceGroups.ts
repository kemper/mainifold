// Face groups — partition the mesh into coplanar (or near-coplanar) regions
// and report each group's centroid, area, normal, and bounding box. This gives
// agents a structural overview of large face groups so they can target paint
// operations procedurally instead of guessing exact seed points.

import type { MeshData } from '../geometry/types';
import { buildAdjacency, findCoplanarRegion, type AdjacencyGraph } from './adjacency';

export interface FaceGroup {
  /** Stable index assigned by traversal order. */
  id: number;
  /** Average outward-pointing unit normal (area-weighted). */
  normal: [number, number, number];
  /** Area-weighted centroid in world coordinates. */
  centroid: [number, number, number];
  /** Sum of triangle areas in this group. */
  area: number;
  /** Number of triangles in this group. */
  triangleCount: number;
  /** Axis-aligned bounding box of the group's triangles. */
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** Triangle indices belonging to this group. Capped by `maxTrianglesPerGroup`. */
  triangleIds: number[];
}

export interface FaceGroupSummary {
  groups: FaceGroup[];
  /** Total triangles in the mesh (sum of triangleCount across all groups). */
  totalTriangles: number;
  /** Tolerance used to compute the grouping. */
  tolerance: number;
}

interface FaceGroupOptions {
  /** Cosine bend tolerance for the BFS that gathers each group. Default 0.9995 (≈1.8°). */
  tolerance?: number;
  /** Skip groups smaller than this many triangles. Default 1 (return everything). */
  minTriangles?: number;
  /** Maximum number of triangle indices to include per group. Default 64.
   *  Set to 0 to omit triangle ids and keep only summary stats. */
  maxTrianglesPerGroup?: number;
  /** Maximum number of groups to return (largest by triangle count first).
   *  Default 256 — large enough for typical models. Set 0 for unlimited. */
  maxGroups?: number;
}

export function computeFaceGroups(mesh: MeshData, options?: FaceGroupOptions): FaceGroupSummary {
  const tolerance = options?.tolerance ?? 0.9995;
  const minTriangles = Math.max(1, options?.minTriangles ?? 1);
  const maxTrianglesPerGroup = options?.maxTrianglesPerGroup ?? 64;
  const maxGroups = options?.maxGroups ?? 256;

  const adjacency = buildAdjacency(mesh);
  const visited = new Uint8Array(mesh.numTri);
  const groups: FaceGroup[] = [];

  for (let seed = 0; seed < mesh.numTri; seed++) {
    if (visited[seed]) continue;
    const triangles = findCoplanarRegion(seed, adjacency, tolerance);
    for (const t of triangles) visited[t] = 1;
    if (triangles.size < minTriangles) continue;
    groups.push(buildGroup(groups.length, triangles, mesh, adjacency, maxTrianglesPerGroup));
  }

  // Largest groups first so an agent that only inspects the top N gets the
  // most structurally significant faces.
  groups.sort((a, b) => b.triangleCount - a.triangleCount);
  for (let i = 0; i < groups.length; i++) groups[i].id = i;

  const trimmed = maxGroups > 0 ? groups.slice(0, maxGroups) : groups;

  return {
    groups: trimmed,
    totalTriangles: mesh.numTri,
    tolerance,
  };
}

function buildGroup(
  id: number,
  triangles: Set<number>,
  mesh: MeshData,
  adjacency: AdjacencyGraph,
  maxIds: number,
): FaceGroup {
  const { triVerts, vertProperties, numProp } = mesh;

  let cx = 0, cy = 0, cz = 0;
  let nx = 0, ny = 0, nz = 0;
  let totalArea = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const ids: number[] = [];

  for (const t of triangles) {
    if (maxIds === 0 ? false : ids.length < maxIds) ids.push(t);

    const v0 = triVerts[t * 3];
    const v1 = triVerts[t * 3 + 1];
    const v2 = triVerts[t * 3 + 2];

    const ax = vertProperties[v0 * numProp];
    const ay = vertProperties[v0 * numProp + 1];
    const az = vertProperties[v0 * numProp + 2];
    const bx = vertProperties[v1 * numProp];
    const by = vertProperties[v1 * numProp + 1];
    const bz = vertProperties[v1 * numProp + 2];
    const cx2 = vertProperties[v2 * numProp];
    const cy2 = vertProperties[v2 * numProp + 1];
    const cz2 = vertProperties[v2 * numProp + 2];

    if (ax < minX) minX = ax; if (ay < minY) minY = ay; if (az < minZ) minZ = az;
    if (bx < minX) minX = bx; if (by < minY) minY = by; if (bz < minZ) minZ = bz;
    if (cx2 < minX) minX = cx2; if (cy2 < minY) minY = cy2; if (cz2 < minZ) minZ = cz2;
    if (ax > maxX) maxX = ax; if (ay > maxY) maxY = ay; if (az > maxZ) maxZ = az;
    if (bx > maxX) maxX = bx; if (by > maxY) maxY = by; if (bz > maxZ) maxZ = bz;
    if (cx2 > maxX) maxX = cx2; if (cy2 > maxY) maxY = cy2; if (cz2 > maxZ) maxZ = cz2;

    // Triangle area = 0.5 * |AB x AC|
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;
    const crx = e1y * e2z - e1z * e2y;
    const cry = e1z * e2x - e1x * e2z;
    const crz = e1x * e2y - e1y * e2x;
    const area = 0.5 * Math.sqrt(crx * crx + cry * cry + crz * crz);

    const triCx = (ax + bx + cx2) / 3;
    const triCy = (ay + by + cy2) / 3;
    const triCz = (az + bz + cz2) / 3;
    cx += triCx * area;
    cy += triCy * area;
    cz += triCz * area;

    nx += adjacency.normals[t * 3] * area;
    ny += adjacency.normals[t * 3 + 1] * area;
    nz += adjacency.normals[t * 3 + 2] * area;

    totalArea += area;
  }

  const safeArea = totalArea > 0 ? totalArea : 1;
  const centroid: [number, number, number] = [cx / safeArea, cy / safeArea, cz / safeArea];

  const nLen = Math.hypot(nx, ny, nz);
  const normal: [number, number, number] = nLen > 0
    ? [nx / nLen, ny / nLen, nz / nLen]
    : [0, 0, 0];

  return {
    id,
    normal,
    centroid,
    area: totalArea,
    triangleCount: triangles.size,
    bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    triangleIds: ids,
  };
}
