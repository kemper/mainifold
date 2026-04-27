// Pen sub-mode — freehand drawing onto the session plane.
//
// Each pointer sample is unprojected onto the active session plane (a flat
// plane frozen in front of the model at activation time). Stroke commits on
// pointer-up; live preview is rendered as the user drags via direct
// mutation of an in-progress Line2.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { addStroke, type StrokeAnnotation } from './annotations';
import {
  getOverlayGroup,
  getLiveResolution,
  setLiveResolution,
  strokeToLine2,
  setLine2Points,
} from './annotationOverlay';
import {
  startSession,
  endSession,
  showPlaneOutline,
  hidePlaneOutline,
  screenToActivePlane,
  getActiveSession,
} from './sessionPlane';
import {
  getRenderer,
  setUserOrbitLock,
  isUserOrbitLocked,
} from '../renderer/viewport';
import { forceDeactivate as forceDeactivatePaint } from '../color/paintUI';
import { forceDeactivate as forceDeactivateText } from './textMode';
import { forceDeactivate as forceDeactivateSelect } from './selectMode';

const DEFAULT_COLOR: [number, number, number] = [0.95, 0.20, 0.45]; // hot pink
const DEFAULT_WIDTH = 4; // pixels
// Minimum world-space distance between sampled points (in plane units). Will
// be scaled to ~0.5% of the camera-to-plane distance per stroke.
const MIN_SAMPLE_FRAC = 0.002;

let active = false;
let currentColor: [number, number, number] = [...DEFAULT_COLOR] as [number, number, number];
let currentWidth = DEFAULT_WIDTH;

let drawing = false;
let currentPoints: THREE.Vector3[] = [];
let priorOrbitLock = false;

let previewLine: Line2 | null = null;

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

/** True if any annotate sub-mode (pen or text) is currently active. Used by
 *  callers (UI, sessionPlane outline) to decide whether to maintain the
 *  shared session plane. */
function anySiblingActive(): boolean {
  // We import sibling state lazily via the sessionPlane.getActiveSession;
  // a non-null active session indicates pen OR text owns it.
  return getActiveSession() !== null;
}

export function activate(): void {
  if (active) return;
  // Mutual exclusion with paint and select modes (text shares the session,
  // so we only stop text when there's no plane to share — which is when the
  // current tab switch is into a fresh activation).
  forceDeactivatePaint();
  forceDeactivateSelect();

  // If no session exists yet (first activation, or after a full deactivate),
  // start a new one. Switching from text → pen reuses the same plane.
  if (!anySiblingActive()) {
    startSession();
  }

  active = true;
  priorOrbitLock = isUserOrbitLocked();
  setUserOrbitLock(true);

  const overlay = getOverlayGroup();
  if (overlay) showPlaneOutline(overlay);

  const canvas = getRenderer().domElement;
  setLiveResolution(canvas.width, canvas.height);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.style.cursor = 'crosshair';

  notifyActiveChange();

  // text mode is mutually exclusive with pen — but text was already turned
  // off via forceDeactivateText path inside textMode? It's not; we deactivate
  // it explicitly to make sure its handlers are detached. (Calling
  // forceDeactivateText after startSession; the session plane stays active.)
  forceDeactivateText({ keepSession: true });
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

  // If no other annotate sub-mode is taking over the session, end it.
  // Callers that want to keep the session (e.g. pen→text switch) call
  // forceDeactivate({keepSession: true}).
}

interface DeactivateOpts { keepSession?: boolean }

export function forceDeactivate(opts: DeactivateOpts = {}): void {
  if (!active) return;
  deactivate();
  if (!opts.keepSession) {
    hidePlaneOutline();
    endSession();
  }
}

function cancelInProgress(): void {
  drawing = false;
  currentPoints = [];
  clearPreview();
}

function ensurePreview(): void {
  if (previewLine) return;
  const overlay = getOverlayGroup();
  if (!overlay) return;
  const session = getActiveSession();
  if (!session) return;

  const placeholder: StrokeAnnotation = {
    type: 'stroke',
    id: '__preview',
    points: currentPoints,
    color: [...currentColor] as [number, number, number],
    width: currentWidth,
    camera: session.camera,
    plane: session,
  };
  previewLine = strokeToLine2(placeholder, getLiveResolution(), false);
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

function minSampleDistance(): number {
  const session = getActiveSession();
  if (!session) return 0.02;
  // Approximate plane-space scale by the camera-to-plane-origin distance.
  const camPos = new THREE.Vector3(
    session.camera.position[0], session.camera.position[1], session.camera.position[2],
  );
  const origin = new THREE.Vector3(session.origin[0], session.origin[1], session.origin[2]);
  const d = camPos.distanceTo(origin);
  return Math.max(d * MIN_SAMPLE_FRAC, 0.005);
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const pt = screenToActivePlane(event);
  if (!pt) return;
  drawing = true;
  currentPoints = [pt];
  try { (event.target as Element).setPointerCapture?.(event.pointerId); } catch { /* */ }
  updatePreviewGeometry();
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!drawing) return;
  const pt = screenToActivePlane(event);
  if (!pt) return;
  const last = currentPoints[currentPoints.length - 1];
  const minDist = minSampleDistance();
  if (last && last.distanceTo(pt) < minDist) return;
  currentPoints.push(pt);
  updatePreviewGeometry();
}

function onPointerUp(event: PointerEvent): void {
  if (!drawing) return;
  drawing = false;
  try { (event.target as Element).releasePointerCapture?.(event.pointerId); } catch { /* */ }

  if (currentPoints.length < 2) {
    cancelInProgress();
    return;
  }

  const session = getActiveSession();
  if (!session) {
    cancelInProgress();
    return;
  }

  const stroke: StrokeAnnotation = {
    type: 'stroke',
    id: makeId(),
    points: currentPoints,
    color: [...currentColor] as [number, number, number],
    width: currentWidth,
    camera: session.camera,
    plane: session,
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
