// Ray-cast and point-probe queries using THREE.Raycaster on mesh data
import * as THREE from 'three';
import type { MeshData } from './types';

export interface RayHit {
  z: number;
  normal: [number, number, number];
  entering: boolean;
}

export interface ProbeResult {
  hits: RayHit[];
  zValues: number[];
  thickness: number | null;
  topZ: number | null;
  bottomZ: number | null;
}

export interface GeneralRayResult {
  hits: { point: [number, number, number]; normal: [number, number, number]; distance: number }[];
}

function meshDataToBufferGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(mesh.numVert * 3);

  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function probeAtXY(meshData: MeshData, x: number, y: number): ProbeResult {
  const geometry = meshDataToBufferGeometry(meshData);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const tempMesh = new THREE.Mesh(geometry, material);

  const raycaster = new THREE.Raycaster();
  // Cast from high above, straight down along -Z
  const origin = new THREE.Vector3(x, y, 1e6);
  const direction = new THREE.Vector3(0, 0, -1);
  raycaster.set(origin, direction);

  const intersections = raycaster.intersectObject(tempMesh);

  const rawHits: RayHit[] = intersections.map(hit => {
    const normal: [number, number, number] = hit.face
      ? [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z]
      : [0, 0, 1];
    // Face normal Z > 0 means top-facing (ray enters), Z < 0 means bottom-facing (ray exits)
    const entering = normal[2] > 0;
    return {
      z: Math.round(hit.point.z * 1000) / 1000,
      normal,
      entering,
    };
  });

  // Deduplicate hits at the same Z (triangulated faces produce duplicates)
  const hits: RayHit[] = [];
  for (const h of rawHits) {
    const existing = hits.find(e => Math.abs(e.z - h.z) < 0.01 && e.entering === h.entering);
    if (!existing) hits.push(h);
  }

  // Sort by Z descending (top to bottom)
  hits.sort((a, b) => b.z - a.z);

  const zValues = hits.map(h => h.z);
  const topZ = zValues.length > 0 ? zValues[0] : null;
  const bottomZ = zValues.length > 0 ? zValues[zValues.length - 1] : null;

  // Compute total material thickness from entry/exit pairs
  let thickness: number | null = null;
  if (hits.length >= 2) {
    let total = 0;
    // Pair up entry/exit: top hit is entry, next is exit, etc.
    for (let i = 0; i < hits.length - 1; i += 2) {
      total += Math.abs(hits[i].z - hits[i + 1].z);
    }
    thickness = Math.round(total * 1000) / 1000;
  }

  // Cleanup
  geometry.dispose();
  material.dispose();

  return { hits, zValues, thickness, topZ, bottomZ };
}

export function probeRay(
  meshData: MeshData,
  origin: [number, number, number],
  direction: [number, number, number],
): GeneralRayResult {
  const geometry = meshDataToBufferGeometry(meshData);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const tempMesh = new THREE.Mesh(geometry, material);

  const raycaster = new THREE.Raycaster();
  const dir = new THREE.Vector3(...direction).normalize();
  raycaster.set(new THREE.Vector3(...origin), dir);

  const intersections = raycaster.intersectObject(tempMesh);

  const rawHits = intersections.map(hit => ({
    point: [
      Math.round(hit.point.x * 1000) / 1000,
      Math.round(hit.point.y * 1000) / 1000,
      Math.round(hit.point.z * 1000) / 1000,
    ] as [number, number, number],
    normal: hit.face
      ? [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z] as [number, number, number]
      : [0, 0, 0] as [number, number, number],
    distance: Math.round(hit.distance * 1000) / 1000,
  }));

  // Deduplicate hits at the same distance (triangulated faces produce duplicates)
  const hits: typeof rawHits = [];
  for (const h of rawHits) {
    const existing = hits.find(e => Math.abs(e.distance - h.distance) < 0.01);
    if (!existing) hits.push(h);
  }

  geometry.dispose();
  material.dispose();

  return { hits };
}

export function measureDistance(
  p1: [number, number, number],
  p2: [number, number, number],
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000) / 1000;
}
