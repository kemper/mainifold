// Annotate mode — pointer-driven freehand surface drawing.
// Each pointer sample is raycast against the current solid mesh; hits become
// stroke vertices, slightly offset along the surface normal to avoid z-fighting
// with the model.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { addStroke, type AnnotationStroke } from './annotations';
import {
  getOverlayGroup,
  getLiveResolution,
  strokeToLine2,
  setLine2Points,
} from './annotationOverlay';
import {
  getMeshGroup,
  getCamera,
  getRenderer,
  setUserOrbitLock,
  isUserOrbitLocked,
} from '../renderer/viewport';
import { forceDeactivate as forceDeactivatePaint } from '../color/paintUI';

const NORMAL_OFFSET_FRAC = 0.005;   // offset = max(model dim) * this
const MIN_POINT_DIST_FRAC = 0.002;  // skip pointer samples closer than this in world units
const MIN_POINT_DIST_FLOOR = 0.02;  // absolute floor on min distance

const DEFAULT_COLOR: [number, number, number] = [0.95, 0.20, 0.45]; // hot pink
const DEFAULT_WIDTH = 4; // pixels

let active = false;
let currentColor: [number, number, number] = [...DEFAULT_COLOR] as [number, number, number];
let currentWidth = DEFAULT_WIDTH;

let drawing = false;
let currentPoints: THREE.Vector3[] = [];
let priorOrbitLock = false;

let previewLine: Line2 | null = null;

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const tmpBox = new THREE.Box3();
const tmpVec = new THREE.Vector3();

const listeners: Array<(active: boolean) => void> = [];

export function isActive(): boolean {
  return active;
}

export function getColor(): [number, number, number] {
  return [...currentColor] as [number, number, number];
}

export function setColor(c: [number, number, number]): void {
  currentColor = [c[0], c[1], c[2]];
}

export function getWidth(): number {
  return currentWidth;
}

export function setWidth(w: number): void {
  currentWidth = w;
}

export function onActiveChange(fn: (active: boolean) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function notifyActiveChange(): void {
  for (const fn of listeners) fn(active);
}

export function activate(): void {
  if (active) return;
  // Mutual exclusion with paint mode: only one drawing tool active at a time.
  forceDeactivatePaint();

  active = true;
  priorOrbitLock = isUserOrbitLocked();
  setUserOrbitLock(true);

  const canvas = getRenderer().domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.style.cursor = 'crosshair';

  notifyActiveChange();
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  cancelInProgress();
  if (!priorOrbitLock) setUserOrbitLock(false);

  const canvas = getRenderer().domElement;
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerCancel);
  canvas.style.cursor = '';

  notifyActiveChange();
}

function cancelInProgress(): void {
  drawing = false;
  currentPoints = [];
  clearPreview();
}

function setMouseFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) return false;
  mouseNDC.x = (x / rect.width) * 2 - 1;
  mouseNDC.y = -(y / rect.height) * 2 + 1;
  return true;
}

function modelMaxDim(): number {
  tmpBox.setFromObject(getMeshGroup());
  const size = tmpBox.getSize(tmpVec);
  return Math.max(size.x, size.y, size.z, 1);
}

function raycastSurface(event: PointerEvent): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  const canvas = getRenderer().domElement;
  if (!setMouseFromEvent(event, canvas)) return null;
  raycaster.setFromCamera(mouseNDC, getCamera());

  const meshGroup = getMeshGroup();
  // The solid mesh is meshGroup.children[0] (matches facePicker's convention).
  const solid = meshGroup.children[0];
  if (!(solid instanceof THREE.Mesh)) return null;

  const hits = raycaster.intersectObject(solid);
  if (hits.length === 0 || !hits[0].face) return null;

  const hit = hits[0];
  if (!hit.face) return null;
  const normal = hit.face.normal.clone()
    .transformDirection(hit.object.matrixWorld)
    .normalize();
  return { point: hit.point.clone(), normal };
}

function offsetAlongNormal(point: THREE.Vector3, normal: THREE.Vector3, dim: number): THREE.Vector3 {
  return point.clone().addScaledVector(normal, dim * NORMAL_OFFSET_FRAC);
}

function ensurePreview(): void {
  if (previewLine) return;
  const overlay = getOverlayGroup();
  if (!overlay) return;
  // Build a placeholder Line2 with the current color/width via the same
  // pipeline used for committed strokes — keeps the look identical.
  const placeholder: AnnotationStroke = {
    id: '__preview',
    points: currentPoints,
    color: [...currentColor] as [number, number, number],
    width: currentWidth,
  };
  previewLine = strokeToLine2(placeholder, getLiveResolution());
  previewLine.name = 'annotation-preview';
  previewLine.renderOrder = 1000;
  overlay.add(previewLine);
}

function updatePreviewGeometry(): void {
  ensurePreview();
  if (!previewLine) return;
  setLine2Points(previewLine, currentPoints);
}

function clearPreview(): void {
  if (!previewLine) return;
  const overlay = getOverlayGroup();
  overlay?.remove(previewLine);
  previewLine.geometry.dispose();
  (previewLine.material as THREE.Material).dispose();
  previewLine = null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const hit = raycastSurface(event);
  if (!hit) return;

  const dim = modelMaxDim();
  drawing = true;
  currentPoints = [offsetAlongNormal(hit.point, hit.normal, dim)];
  try {
    (event.target as Element).setPointerCapture?.(event.pointerId);
  } catch { /* not all targets support capture */ }
  updatePreviewGeometry();
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!drawing) return;
  const hit = raycastSurface(event);
  if (!hit) return;

  const dim = modelMaxDim();
  const next = offsetAlongNormal(hit.point, hit.normal, dim);
  const last = currentPoints[currentPoints.length - 1];
  const minDist = Math.max(dim * MIN_POINT_DIST_FRAC, MIN_POINT_DIST_FLOOR);
  if (last && last.distanceTo(next) < minDist) return;

  currentPoints.push(next);
  updatePreviewGeometry();
}

function onPointerUp(event: PointerEvent): void {
  if (!drawing) return;
  drawing = false;
  try {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
  } catch { /* ignore */ }

  if (currentPoints.length < 2) {
    cancelInProgress();
    return;
  }

  const stroke: AnnotationStroke = {
    id: makeId(),
    points: currentPoints,
    color: [...currentColor] as [number, number, number],
    width: currentWidth,
  };
  currentPoints = [];
  clearPreview();
  addStroke(stroke);
}

function onPointerCancel(_event: PointerEvent): void {
  cancelInProgress();
}

function makeId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Public hook for external code (e.g. paint mode UI) to forcibly drop annotate mode. */
export function forceDeactivate(): void {
  if (active) deactivate();
}
