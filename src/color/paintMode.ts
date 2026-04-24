// Paint mode — coordinates face picking, hover preview, and color application

import * as THREE from 'three';
import type { MeshData } from '../geometry/types';
import { pickFace } from './facePicker';
import { buildAdjacency, findCoplanarRegion, getTriangleNormal, type AdjacencyGraph } from './adjacency';
import { addRegion, getRegions } from './regions';
import { getMeshGroup, getRenderer } from '../renderer/viewport';

let active = false;
let currentColor: [number, number, number] = [1, 0.2, 0.2]; // default red
let adjacency: AdjacencyGraph | null = null;
let currentMesh: MeshData | null = null;

// Hover highlight state
let highlightMesh: THREE.Mesh | null = null;
let hoveredTriangles: Set<number> | null = null;

// Callbacks
let onRegionPainted: (() => void) | null = null;

export function isActive(): boolean { return active; }

export function setColor(color: [number, number, number]): void {
  currentColor = color;
}

export function getColor(): [number, number, number] {
  return currentColor;
}

export function setOnRegionPainted(fn: () => void): void {
  onRegionPainted = fn;
}

/** Rebuild adjacency graph for a new mesh. Call this whenever updateMesh fires. */
export function updatePaintMesh(mesh: MeshData): void {
  currentMesh = mesh;
  if (active) {
    adjacency = buildAdjacency(mesh);
  }
  clearHighlight();
}

export function activate(): void {
  if (active) return;
  active = true;

  if (currentMesh) {
    adjacency = buildAdjacency(currentMesh);
  }

  const canvas = getRenderer().domElement;
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  canvas.style.cursor = 'crosshair';
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  adjacency = null;

  const canvas = getRenderer().domElement;
  canvas.removeEventListener('mousemove', onMouseMove);
  canvas.removeEventListener('click', onClick);
  canvas.style.cursor = '';
  clearHighlight();
}

function onMouseMove(event: MouseEvent): void {
  if (!adjacency || !currentMesh) return;

  const result = pickFace(event);
  if (!result) {
    clearHighlight();
    return;
  }

  const region = findCoplanarRegion(result.triangleIndex, adjacency);
  if (hoveredTriangles && setsEqual(hoveredTriangles, region)) return;

  hoveredTriangles = region;
  showHighlight(region);
}

function onClick(event: MouseEvent): void {
  if (!adjacency || !currentMesh) return;

  const result = pickFace(event);
  if (!result) return;

  const region = findCoplanarRegion(result.triangleIndex, adjacency);
  const normal = getTriangleNormal(result.triangleIndex, adjacency);

  // Create a named region
  const existingCount = getRegions().length;
  const name = `Region ${existingCount + 1}`;

  addRegion(
    name,
    [...currentColor] as [number, number, number],
    'face-pick',
    {
      kind: 'coplanar',
      seedPoint: result.point,
      seedNormal: normal,
      normalTolerance: 0.9995,
    },
    region,
  );

  clearHighlight();

  if (onRegionPainted) onRegionPainted();
}

function showHighlight(triangles: Set<number>): void {
  clearHighlight();
  if (!currentMesh) return;

  const { triVerts, vertProperties, numProp } = currentMesh;

  // Build a geometry from just the highlighted triangles
  const positions = new Float32Array(triangles.size * 9);
  let idx = 0;

  for (const t of triangles) {
    const v0 = triVerts[t * 3];
    const v1 = triVerts[t * 3 + 1];
    const v2 = triVerts[t * 3 + 2];

    for (const vi of [v0, v1, v2]) {
      positions[idx++] = vertProperties[vi * numProp];
      positions[idx++] = vertProperties[vi * numProp + 1];
      positions[idx++] = vertProperties[vi * numProp + 2];
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(currentColor[0], currentColor[1], currentColor[2]),
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  highlightMesh = new THREE.Mesh(geo, mat);
  highlightMesh.name = 'paint-hover';
  highlightMesh.renderOrder = 999;
  getMeshGroup().add(highlightMesh);
}

function clearHighlight(): void {
  if (highlightMesh) {
    getMeshGroup().remove(highlightMesh);
    highlightMesh.geometry.dispose();
    (highlightMesh.material as THREE.Material).dispose();
    highlightMesh = null;
  }
  hoveredTriangles = null;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
