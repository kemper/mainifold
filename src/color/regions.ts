// ColorRegionStore — manages per-face color regions for the current mesh

import type { MeshData } from '../geometry/types';

export interface ColorRegion {
  id: number;
  name: string;
  color: [number, number, number]; // RGB 0..1
  source: 'face-pick' | 'slab' | 'subtree' | 'paintbrush';
  descriptor: RegionDescriptor;
  order: number;
  triangles: Set<number>; // resolved triangle indices (transient, not persisted)
}

export type RegionDescriptor =
  | { kind: 'coplanar'; seedPoint: [number, number, number]; seedNormal: [number, number, number]; normalTolerance: number }
  | { kind: 'slab'; axis: 'x' | 'y' | 'z'; min: number; max: number }
  | { kind: 'triangles'; ids: number[] };

export interface SerializedColorRegion {
  id: number;
  name: string;
  color: [number, number, number];
  source: ColorRegion['source'];
  descriptor: RegionDescriptor;
  order: number;
}

type ChangeListener = () => void;

let regions: ColorRegion[] = [];
let nextOrder = 1;
const listeners: ChangeListener[] = [];

function notify(): void {
  for (const fn of listeners) fn();
}

export function onChange(fn: ChangeListener): void {
  listeners.push(fn);
}

export function removeChangeListener(fn: ChangeListener): void {
  const idx = listeners.indexOf(fn);
  if (idx >= 0) listeners.splice(idx, 1);
}

export function getRegions(): readonly ColorRegion[] {
  return regions;
}

export function hasRegions(): boolean {
  return regions.length > 0;
}

export function addRegion(
  name: string,
  color: [number, number, number],
  source: ColorRegion['source'],
  descriptor: RegionDescriptor,
  triangles: Set<number>,
): ColorRegion {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const region: ColorRegion = {
    id,
    name,
    color,
    source,
    descriptor,
    order: nextOrder++,
    triangles,
  };
  regions.push(region);
  notify();
  return region;
}

export function removeRegion(id: number): boolean {
  const idx = regions.findIndex(r => r.id === id);
  if (idx < 0) return false;
  regions.splice(idx, 1);
  notify();
  return true;
}

export function updateRegionColor(id: number, color: [number, number, number]): void {
  const region = regions.find(r => r.id === id);
  if (region) {
    region.color = color;
    notify();
  }
}

export function clearRegions(): void {
  if (regions.length === 0) return;
  regions = [];
  nextOrder = 1;
  notify();
}

/** Build triColors (Uint8Array, numTri*3 RGB) from current regions.
 *  Higher-order regions win on overlap. Returns null if no regions. */
export function buildTriColors(numTri: number): Uint8Array | null {
  if (regions.length === 0) return null;

  const buf = new Uint8Array(numTri * 3); // default 0,0,0 — will be ignored for unpainted tris

  // Track which triangles are painted and with what priority
  const triOrder = new Int32Array(numTri); // 0 = unpainted
  triOrder.fill(0);

  // Sort by order ascending so higher-order regions overwrite lower
  const sorted = [...regions].sort((a, b) => a.order - b.order);

  for (const region of sorted) {
    const r = Math.round(region.color[0] * 255);
    const g = Math.round(region.color[1] * 255);
    const b = Math.round(region.color[2] * 255);
    for (const tri of region.triangles) {
      if (tri >= 0 && tri < numTri && region.order >= triOrder[tri]) {
        buf[tri * 3] = r;
        buf[tri * 3 + 1] = g;
        buf[tri * 3 + 2] = b;
        triOrder[tri] = region.order;
      }
    }
  }

  // Mark which triangles are painted (any with order > 0)
  // We use a separate flag array to distinguish "painted black" from "unpainted"
  const painted = new Uint8Array(numTri);
  for (let i = 0; i < numTri; i++) {
    if (triOrder[i] > 0) painted[i] = 1;
  }

  // Store the painted mask on the result for the renderer
  (buf as Uint8Array & { _painted?: Uint8Array })._painted = painted;
  return buf;
}

/** Which triangles are painted in a triColors buffer? */
export function isPainted(triColors: Uint8Array, triIndex: number): boolean {
  const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
  return painted ? painted[triIndex] === 1 : (triColors[triIndex * 3] !== 0 || triColors[triIndex * 3 + 1] !== 0 || triColors[triIndex * 3 + 2] !== 0);
}

export function serialize(): SerializedColorRegion[] {
  return regions.map(r => ({
    id: r.id,
    name: r.name,
    color: r.color,
    source: r.source,
    descriptor: r.descriptor,
    order: r.order,
  }));
}

export function deserialize(data: SerializedColorRegion[]): void {
  regions = data.map(d => ({
    ...d,
    triangles: new Set<number>(),
  }));
  nextOrder = regions.reduce((max, r) => Math.max(max, r.order + 1), 1);
}

/** Apply triColors to a MeshData, returning a new object (non-destructive). */
export function applyTriColors(mesh: MeshData): MeshData {
  const triColors = buildTriColors(mesh.numTri);
  if (!triColors) return mesh;
  return { ...mesh, triColors };
}
