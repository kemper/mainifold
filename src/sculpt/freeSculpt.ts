// Free-sculpt mode — minimal "push vertex" tool used only on frozen-mesh
// versions. On click, the closest vertex of the hit triangle is shifted
// along the hit normal by a fixed step. The new mesh is validated via
// `Manifold.ofMesh()` and, if valid, the on-disk meshBlob is overwritten in
// place (no new version per click; the blob IS the source of truth).

import { pickFace } from '../color/facePicker';
import { getRenderer, setUserOrbitLock, isUserOrbitLocked } from '../renderer/viewport';
import type { MeshData } from '../geometry/types';

export const DEFAULT_PUSH_STEP = 1.0;

let active = false;
let priorOrbitLock = false;
let pushStep = DEFAULT_PUSH_STEP;
let onPush: ((newMesh: MeshData) => void | Promise<void>) | null = null;
let getMesh: (() => MeshData | null) | null = null;

export function isActive(): boolean { return active; }

export function setPushStep(step: number): void {
  if (Number.isFinite(step) && step > 0) pushStep = step;
}

export function getPushStep(): number { return pushStep; }

export function configure(opts: {
  getMesh: () => MeshData | null;
  onPush: (newMesh: MeshData) => void | Promise<void>;
}): void {
  getMesh = opts.getMesh;
  onPush = opts.onPush;
}

export function activate(): void {
  if (active) return;
  active = true;
  priorOrbitLock = isUserOrbitLocked();
  setUserOrbitLock(true);
  const canvas = getRenderer().domElement;
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.style.cursor = 'crosshair';
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  if (!priorOrbitLock) setUserOrbitLock(false);
  const canvas = getRenderer().domElement;
  canvas.removeEventListener('mousedown', onMouseDown);
  canvas.style.cursor = '';
}

function onMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return;
  if (!getMesh || !onPush) return;
  const mesh = getMesh();
  if (!mesh) return;
  const hit = pickFace(event);
  if (!hit) return;
  event.preventDefault();

  // Find the vertex of the hit triangle closest to the click point.
  const { triVerts, vertProperties, numProp } = mesh;
  const t = hit.triangleIndex;
  if (t * 3 + 2 >= triVerts.length) return;
  const vIdxs = [triVerts[t * 3], triVerts[t * 3 + 1], triVerts[t * 3 + 2]];

  const [px, py, pz] = hit.point;
  let bestIdx = vIdxs[0];
  let bestDistSq = Infinity;
  for (const vi of vIdxs) {
    const x = vertProperties[vi * numProp];
    const y = vertProperties[vi * numProp + 1];
    const z = vertProperties[vi * numProp + 2];
    const dx = x - px, dy = y - py, dz = z - pz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDistSq) {
      bestDistSq = d;
      bestIdx = vi;
    }
  }

  // Build a new mesh with that vertex pushed along the hit normal. Copy
  // arrays so we don't mutate the live mesh — downstream code (the manifold
  // we're about to discard, paint adjacency, etc.) may still hold refs.
  const newVerts = new Float32Array(vertProperties);
  const [nx, ny, nz] = hit.normal;
  newVerts[bestIdx * numProp] += nx * pushStep;
  newVerts[bestIdx * numProp + 1] += ny * pushStep;
  newVerts[bestIdx * numProp + 2] += nz * pushStep;

  const newMesh: MeshData = {
    vertProperties: newVerts,
    triVerts: new Uint32Array(triVerts),
    numVert: mesh.numVert,
    numTri: mesh.numTri,
    numProp,
  };

  // Mark a microtask gate so tests / external code can poll for the push to
  // commit. The promise returned by `onPush` may persist the mesh to IDB
  // (the editor's wiring does); we expose its completion as a window event.
  const pending = onPush(newMesh);
  if (pending && typeof (pending as Promise<unknown>).then === 'function') {
    (pending as Promise<unknown>).finally(() => {
      window.dispatchEvent(new CustomEvent('pw-sculpt-push-committed'));
    });
  } else {
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('pw-sculpt-push-committed')));
  }
}
