// Triangle adjacency and coplanar region finding

import type { MeshData } from '../geometry/types';

export interface AdjacencyGraph {
  /** For each triangle index, the list of adjacent triangle indices (sharing an edge). */
  neighbors: Uint32Array[];
  /** Triangle normals — 3 floats per triangle (nx, ny, nz). */
  normals: Float32Array;
}

/** Create a canonical edge key from two vertex indices (order-independent). */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/** Build a triangle adjacency graph from mesh data.
 *  O(numTri) with Map-based edge lookup. */
export function buildAdjacency(mesh: MeshData): AdjacencyGraph {
  const { triVerts, numTri, vertProperties, numProp } = mesh;

  // Build edge → triangle list map
  const edgeToTris = new Map<string, number[]>();

  for (let t = 0; t < numTri; t++) {
    const v0 = triVerts[t * 3];
    const v1 = triVerts[t * 3 + 1];
    const v2 = triVerts[t * 3 + 2];

    for (const key of [edgeKey(v0, v1), edgeKey(v1, v2), edgeKey(v2, v0)]) {
      let list = edgeToTris.get(key);
      if (!list) {
        list = [];
        edgeToTris.set(key, list);
      }
      list.push(t);
    }
  }

  // Build neighbor lists
  const neighbors: Set<number>[] = new Array(numTri);
  for (let i = 0; i < numTri; i++) neighbors[i] = new Set();

  for (const tris of edgeToTris.values()) {
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        neighbors[tris[i]].add(tris[j]);
        neighbors[tris[j]].add(tris[i]);
      }
    }
  }

  // Compute triangle normals
  const normals = new Float32Array(numTri * 3);
  for (let t = 0; t < numTri; t++) {
    const v0 = triVerts[t * 3];
    const v1 = triVerts[t * 3 + 1];
    const v2 = triVerts[t * 3 + 2];

    const ax = vertProperties[v1 * numProp] - vertProperties[v0 * numProp];
    const ay = vertProperties[v1 * numProp + 1] - vertProperties[v0 * numProp + 1];
    const az = vertProperties[v1 * numProp + 2] - vertProperties[v0 * numProp + 2];

    const bx = vertProperties[v2 * numProp] - vertProperties[v0 * numProp];
    const by = vertProperties[v2 * numProp + 1] - vertProperties[v0 * numProp + 1];
    const bz = vertProperties[v2 * numProp + 2] - vertProperties[v0 * numProp + 2];

    // Cross product
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    normals[t * 3] = nx;
    normals[t * 3 + 1] = ny;
    normals[t * 3 + 2] = nz;
  }

  return {
    neighbors: neighbors.map(s => new Uint32Array(s)),
    normals,
  };
}

/** BFS from a seed triangle, collecting all adjacent triangles whose normal is
 *  within `normalTolerance` (dot product threshold, e.g. 0.9995) of the seed's normal.
 *  Returns the set of triangle indices forming the coplanar region. */
export function findCoplanarRegion(
  seedTri: number,
  adjacency: AdjacencyGraph,
  normalTolerance = 0.9995,
): Set<number> {
  const { neighbors, normals } = adjacency;
  const result = new Set<number>();

  const seedNx = normals[seedTri * 3];
  const seedNy = normals[seedTri * 3 + 1];
  const seedNz = normals[seedTri * 3 + 2];

  const queue = [seedTri];
  result.add(seedTri);

  while (queue.length > 0) {
    const current = queue.pop()!;
    const adj = neighbors[current];
    for (let i = 0; i < adj.length; i++) {
      const neighbor = adj[i];
      if (result.has(neighbor)) continue;

      const nx = normals[neighbor * 3];
      const ny = normals[neighbor * 3 + 1];
      const nz = normals[neighbor * 3 + 2];

      const dot = seedNx * nx + seedNy * ny + seedNz * nz;
      if (dot >= normalTolerance) {
        result.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return result;
}

/** Get the normal of a specific triangle. */
export function getTriangleNormal(triIndex: number, adjacency: AdjacencyGraph): [number, number, number] {
  return [
    adjacency.normals[triIndex * 3],
    adjacency.normals[triIndex * 3 + 1],
    adjacency.normals[triIndex * 3 + 2],
  ];
}

/** Get the centroid of a specific triangle. */
export function getTriangleCentroid(triIndex: number, mesh: MeshData): [number, number, number] {
  const { triVerts, vertProperties, numProp } = mesh;
  const v0 = triVerts[triIndex * 3];
  const v1 = triVerts[triIndex * 3 + 1];
  const v2 = triVerts[triIndex * 3 + 2];

  return [
    (vertProperties[v0 * numProp] + vertProperties[v1 * numProp] + vertProperties[v2 * numProp]) / 3,
    (vertProperties[v0 * numProp + 1] + vertProperties[v1 * numProp + 1] + vertProperties[v2 * numProp + 1]) / 3,
    (vertProperties[v0 * numProp + 2] + vertProperties[v1 * numProp + 2] + vertProperties[v2 * numProp + 2]) / 3,
  ];
}

/** Resolve a spatial seed descriptor back to a triangle index by raycasting
 *  from seedPoint along -seedNormal into the mesh. Returns the first triangle
 *  whose normal matches within tolerance, or -1 if none found. */
export function resolveSeed(
  seedPoint: [number, number, number],
  seedNormal: [number, number, number],
  mesh: MeshData,
  adjacency: AdjacencyGraph,
  normalTolerance = 0.9995,
): number {
  const { triVerts, vertProperties, numProp, numTri } = mesh;
  const epsilon = 0.01;

  // Ray origin: slightly above the surface along the normal
  const ox = seedPoint[0] + seedNormal[0] * epsilon;
  const oy = seedPoint[1] + seedNormal[1] * epsilon;
  const oz = seedPoint[2] + seedNormal[2] * epsilon;

  // Ray direction: into the surface
  const dx = -seedNormal[0];
  const dy = -seedNormal[1];
  const dz = -seedNormal[2];

  let bestT = Infinity;
  let bestTri = -1;

  for (let t = 0; t < numTri; t++) {
    const v0i = triVerts[t * 3];
    const v1i = triVerts[t * 3 + 1];
    const v2i = triVerts[t * 3 + 2];

    const p0x = vertProperties[v0i * numProp];
    const p0y = vertProperties[v0i * numProp + 1];
    const p0z = vertProperties[v0i * numProp + 2];
    const p1x = vertProperties[v1i * numProp];
    const p1y = vertProperties[v1i * numProp + 1];
    const p1z = vertProperties[v1i * numProp + 2];
    const p2x = vertProperties[v2i * numProp];
    const p2y = vertProperties[v2i * numProp + 1];
    const p2z = vertProperties[v2i * numProp + 2];

    // Möller–Trumbore intersection
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;

    const a = e1x * hx + e1y * hy + e1z * hz;
    if (a > -1e-8 && a < 1e-8) continue;

    const f = 1 / a;
    const sx = ox - p0x, sy = oy - p0y, sz = oz - p0z;
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;

    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = f * (dx * qx + dy * qy + dz * qz);
    if (v < 0 || u + v > 1) continue;

    const tHit = f * (e2x * qx + e2y * qy + e2z * qz);
    if (tHit > 0 && tHit < bestT) {
      // Check normal tolerance
      const nx = adjacency.normals[t * 3];
      const ny = adjacency.normals[t * 3 + 1];
      const nz = adjacency.normals[t * 3 + 2];
      const dot = seedNormal[0] * nx + seedNormal[1] * ny + seedNormal[2] * nz;
      if (dot >= normalTolerance) {
        bestT = tHit;
        bestTri = t;
      }
    }
  }

  return bestTri;
}
