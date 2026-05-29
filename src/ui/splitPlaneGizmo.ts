// Interactive split-plane gizmo. Spawns a translucent plane in the viewport with
// a transform gizmo so the user can position and rotate the cut, then the Print
// panel reads getSplitPlane() and slices the model along it. Mirrors the
// boxDrag.ts pattern (proxy + TransformControls attached in the scene, gizmo
// lock during drags) — the plane visual is a quad in the proxy's local XY, so
// the cut normal is the proxy's local +Z.

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { MeshData } from '../geometry/types';
import { getScene, getCamera, getRenderer, setGizmoLock } from '../renderer/viewport';

export type PlaneGizmoMode = 'translate' | 'rotate';

let active = false;
let mode: PlaneGizmoMode = 'translate';
let proxy: THREE.Object3D | null = null;
let planeMesh: THREE.Mesh | null = null;
let planeEdges: THREE.LineSegments | null = null;
let gizmo: TransformControls | null = null;
let gizmoHelper: THREE.Object3D | null = null;
let planeSize = 50;

const changeListeners: Array<() => void> = [];

export function isSplitPlaneActive(): boolean { return active; }

export function onSplitPlaneChange(fn: () => void): () => void {
  changeListeners.push(fn);
  return () => {
    const i = changeListeners.indexOf(fn);
    if (i >= 0) changeListeners.splice(i, 1);
  };
}

function notifyChange(): void {
  for (const fn of changeListeners) fn();
}

export function setSplitPlaneMode(m: PlaneGizmoMode): void {
  mode = m;
  gizmo?.setMode(m);
}

export function getSplitPlaneMode(): PlaneGizmoMode { return mode; }

/** Current cut plane in world space: a point on it + the unit normal (proxy +Z). */
export function getSplitPlane(): { point: [number, number, number]; normal: [number, number, number] } {
  if (!proxy) return { point: [0, 0, 0], normal: [0, 0, 1] };
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(proxy.quaternion).normalize();
  return {
    point: [proxy.position.x, proxy.position.y, proxy.position.z],
    normal: [n.x, n.y, n.z],
  };
}

function bounds(mesh: MeshData): { center: THREE.Vector3; maxDim: number } {
  const v = mesh.vertProperties; const p = mesh.numProp;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.numVert; i++) {
    const x = v[i * p], y = v[i * p + 1], z = v[i * p + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    maxDim: Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 10,
  };
}

export function activate(mesh: MeshData): void {
  if (active) { updateMeshRef(mesh); return; }
  active = true;
  buildPlane(mesh);
  buildGizmo();
  notifyChange();
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  setGizmoLock(false);
  disposeGizmo();
  disposePlane();
}

/** Re-centre/re-size the plane visual when the underlying model changes, keeping
 *  the current orientation. */
export function updateMeshRef(mesh: MeshData): void {
  if (!active || !proxy) return;
  const { center, maxDim } = bounds(mesh);
  planeSize = maxDim * 1.5;
  proxy.position.copy(center);
  rebuildPlaneVisual();
  notifyChange();
}

function buildPlane(mesh: MeshData): void {
  const { center, maxDim } = bounds(mesh);
  planeSize = maxDim * 1.5;

  proxy = new THREE.Object3D();
  proxy.position.copy(center);
  getScene().add(proxy);

  const geo = new THREE.PlaneGeometry(planeSize, planeSize);
  const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  planeMesh = new THREE.Mesh(geo, mat);
  planeMesh.name = 'split-plane';
  planeMesh.renderOrder = 998;
  proxy.add(planeMesh);

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, depthTest: false });
  planeEdges = new THREE.LineSegments(edgeGeo, edgeMat);
  planeEdges.name = 'split-plane-edges';
  planeEdges.renderOrder = 999;
  proxy.add(planeEdges);
}

function rebuildPlaneVisual(): void {
  if (!planeMesh || !planeEdges) return;
  const oldGeo = planeMesh.geometry;
  const oldEdge = planeEdges.geometry;
  const geo = new THREE.PlaneGeometry(planeSize, planeSize);
  planeMesh.geometry = geo;
  planeEdges.geometry = new THREE.EdgesGeometry(geo);
  oldGeo.dispose();
  oldEdge.dispose();
}

function disposePlane(): void {
  if (planeMesh) { planeMesh.geometry.dispose(); (planeMesh.material as THREE.Material).dispose(); planeMesh.parent?.remove(planeMesh); planeMesh = null; }
  if (planeEdges) { planeEdges.geometry.dispose(); (planeEdges.material as THREE.Material).dispose(); planeEdges.parent?.remove(planeEdges); planeEdges = null; }
  if (proxy) { proxy.parent?.remove(proxy); proxy = null; }
}

function buildGizmo(): void {
  if (!proxy) return;
  gizmo = new TransformControls(getCamera(), getRenderer().domElement);
  gizmo.setMode(mode);
  gizmo.setSize(0.85);
  gizmo.attach(proxy);
  gizmoHelper = gizmo.getHelper();
  getScene().add(gizmoHelper);

  gizmo.addEventListener('change', () => notifyChange());
  gizmo.addEventListener('axis-changed', (e) => setGizmoLock(e.value !== null || gizmo!.dragging));
  gizmo.addEventListener('dragging-changed', (e) => setGizmoLock(e.value === true || gizmo!.axis !== null));
}

function disposeGizmo(): void {
  if (gizmo) { gizmo.detach(); gizmo.dispose(); gizmo = null; }
  if (gizmoHelper) { gizmoHelper.parent?.remove(gizmoHelper); gizmoHelper = null; }
}
