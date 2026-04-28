// Paint mode — coordinates face picking, hover preview, and color application.
// Supports three tools: bucket (coplanar flood fill), brush (single face), slab (axis/normal range).

import * as THREE from 'three';
import type { MeshData } from '../geometry/types';
import { pickFace } from './facePicker';
import { buildAdjacency, findCoplanarRegion, getTriangleNormal, type AdjacencyGraph } from './adjacency';
import { addRegion, getRegions } from './regions';
import { getMeshGroup, getRenderer, setUserOrbitLock, isUserOrbitLocked } from '../renderer/viewport';
import { activate as activateSlabDrag, deactivate as deactivateSlabDrag, onMeshChanged as onSlabDragMeshChanged } from './slabDrag';
export { setSlabAxis, getSlabAxis } from './slabDrag';

export type PaintTool = 'bucket' | 'brush' | 'slab';

let active = false;
let currentColor: [number, number, number] = [1, 0.2, 0.2]; // default red
let currentTool: PaintTool = 'bucket';
let bucketTolerance = 0.9995;
let adjacency: AdjacencyGraph | null = null;
let currentMesh: MeshData | null = null;

// Hover highlight state
let highlightMesh: THREE.Mesh | null = null;
let hoveredTriangles: Set<number> | null = null;

// Brush drag state
let brushPainting = false;
let brushSession: Set<number> | null = null;

// Orbit lock — paint mode locks model rotation by default. The lock-toggle
// button in the toolbar reflects this; users can unlock manually to reposition.
let priorOrbitLock = false;

// Callbacks
let onRegionPainted: (() => void) | null = null;
let onToolChange: ((tool: PaintTool) => void) | null = null;

export function isActive(): boolean { return active; }

export function setColor(color: [number, number, number]): void {
  currentColor = color;
}

export function getColor(): [number, number, number] {
  return currentColor;
}

export function setTool(tool: PaintTool): void {
  if (currentTool === tool) return;
  const prev = currentTool;
  currentTool = tool;
  clearHighlight();

  if (active) {
    if (tool === 'slab') activateSlabDrag();
    else if (prev === 'slab') deactivateSlabDrag();
  }

  if (onToolChange) onToolChange(tool);
}

export function getTool(): PaintTool {
  return currentTool;
}

export function setBucketTolerance(tol: number): void {
  bucketTolerance = Math.max(-1, Math.min(1, tol));
}

export function getBucketTolerance(): number {
  return bucketTolerance;
}

export function setOnRegionPainted(fn: () => void): void {
  onRegionPainted = fn;
}

export function setOnToolChange(fn: (tool: PaintTool) => void): void {
  onToolChange = fn;
}

export function getCurrentMesh(): MeshData | null {
  return currentMesh;
}

export function getAdjacency(): AdjacencyGraph | null {
  return adjacency;
}

/** Rebuild adjacency graph for a new mesh. Call this whenever updateMesh fires. */
export function updatePaintMesh(mesh: MeshData): void {
  currentMesh = mesh;
  if (active) {
    adjacency = buildAdjacency(mesh);
    onSlabDragMeshChanged();
  }
  clearHighlight();
}

export function activate(): void {
  if (active) return;
  active = true;

  if (currentMesh) {
    adjacency = buildAdjacency(currentMesh);
  }

  priorOrbitLock = isUserOrbitLocked();
  setUserOrbitLock(true);

  const canvas = getRenderer().domElement;
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.style.cursor = 'crosshair';

  if (currentTool === 'slab') activateSlabDrag();
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  adjacency = null;

  if (!priorOrbitLock) setUserOrbitLock(false);

  deactivateSlabDrag();

  const canvas = getRenderer().domElement;
  canvas.removeEventListener('mousemove', onMouseMove);
  canvas.removeEventListener('mousedown', onMouseDown);
  canvas.removeEventListener('mouseup', onMouseUp);
  canvas.removeEventListener('mouseleave', onMouseLeave);
  canvas.style.cursor = '';
  clearHighlight();
  brushPainting = false;
  brushSession = null;
}

function onMouseMove(event: MouseEvent): void {
  if (!adjacency || !currentMesh) return;

  // Slab tool doesn't use viewport hover; controls are panel-based.
  if (currentTool === 'slab') {
    clearHighlight();
    return;
  }

  // Brush drag: collect triangles into the active brush session.
  if (currentTool === 'brush' && brushPainting && brushSession) {
    const result = pickFace(event);
    if (result) {
      brushSession.add(result.triangleIndex);
      showHighlight(brushSession);
    }
    return;
  }

  const result = pickFace(event);
  if (!result) {
    clearHighlight();
    return;
  }

  let region: Set<number>;
  if (currentTool === 'brush') {
    region = new Set([result.triangleIndex]);
  } else {
    region = findCoplanarRegion(result.triangleIndex, adjacency, bucketTolerance);
  }

  if (hoveredTriangles && setsEqual(hoveredTriangles, region)) return;

  hoveredTriangles = region;
  showHighlight(region);
}

function onMouseDown(event: MouseEvent): void {
  if (!adjacency || !currentMesh) return;
  if (event.button !== 0) return;
  if (currentTool === 'slab') return;

  if (currentTool === 'brush') {
    const result = pickFace(event);
    if (!result) return;
    brushPainting = true;
    brushSession = new Set([result.triangleIndex]);
    showHighlight(brushSession);
    event.preventDefault();
  }
}

function onMouseUp(event: MouseEvent): void {
  if (!adjacency || !currentMesh) return;
  if (event.button !== 0) return;
  if (currentTool === 'slab') return;

  if (currentTool === 'brush') {
    if (!brushPainting || !brushSession || brushSession.size === 0) {
      brushPainting = false;
      brushSession = null;
      return;
    }
    const triangles = brushSession;
    const existingCount = getRegions().length;
    addRegion(
      `Region ${existingCount + 1}`,
      [...currentColor] as [number, number, number],
      'paintbrush',
      { kind: 'triangles', ids: [...triangles] },
      triangles,
    );
    brushPainting = false;
    brushSession = null;
    clearHighlight();
    if (onRegionPainted) onRegionPainted();
    return;
  }

  // Bucket: paint on click release (matches the previous click behavior)
  const result = pickFace(event);
  if (!result) return;

  const region = findCoplanarRegion(result.triangleIndex, adjacency, bucketTolerance);
  const normal = getTriangleNormal(result.triangleIndex, adjacency);

  const existingCount = getRegions().length;
  addRegion(
    `Region ${existingCount + 1}`,
    [...currentColor] as [number, number, number],
    'face-pick',
    {
      kind: 'coplanar',
      seedPoint: result.point,
      seedNormal: normal,
      normalTolerance: bucketTolerance,
    },
    region,
  );

  clearHighlight();
  if (onRegionPainted) onRegionPainted();
}

function onMouseLeave(): void {
  if (currentTool === 'brush' && brushPainting && brushSession && brushSession.size > 0) {
    // Commit whatever the user has painted so far.
    const triangles = brushSession;
    const existingCount = getRegions().length;
    addRegion(
      `Region ${existingCount + 1}`,
      [...currentColor] as [number, number, number],
      'paintbrush',
      { kind: 'triangles', ids: [...triangles] },
      triangles,
    );
    if (onRegionPainted) onRegionPainted();
  }
  brushPainting = false;
  brushSession = null;
  clearHighlight();
}

/** Public helper: render a hover-style highlight over a triangle set.
 *  Used by the slab UI for live preview. Returns a teardown function. */
export function previewTriangles(triangles: Set<number>): () => void {
  showHighlight(triangles);
  return () => clearHighlight();
}

function showHighlight(triangles: Set<number>): void {
  clearHighlight();
  if (!currentMesh) return;
  if (triangles.size === 0) return;

  const { triVerts, vertProperties, numProp } = currentMesh;

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
