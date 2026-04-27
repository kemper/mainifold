// Select sub-mode — click an annotation to select it (highlight); drag to
// translate it on its own plane (the plane captured at its creation);
// Delete/Backspace removes it; Esc deselects.
//
// Unlike pen/text, select mode does NOT lock orbit — the user can rotate
// the camera to find the annotation they want before grabbing it.

import * as THREE from 'three';
import {
  getAnnotationById,
  removeAnnotationById,
  updateStrokePoints,
  updateTextAnchor,
  type Annotation,
} from './annotations';
import {
  getOverlayGroup,
} from './annotationOverlay';
import {
  endSession,
  hidePlaneOutline,
  screenToPlane,
  sessionToPlane,
  restoreCameraView,
} from './sessionPlane';
import {
  getCamera,
  getRenderer,
} from '../renderer/viewport';
import { forceDeactivate as forceDeactivatePaint } from '../color/paintUI';
import { forceDeactivate as forceDeactivatePen } from './annotateMode';
import { forceDeactivate as forceDeactivateText } from './textMode';

let active = false;
let selectedId: string | null = null;

// Drag state
let dragging = false;
let dragInitialIntersection: THREE.Vector3 | null = null;
let dragInitialStrokePoints: THREE.Vector3[] | null = null;
let dragInitialTextAnchor: THREE.Vector3 | null = null;

const raycaster = new THREE.Raycaster();
// Default Line2 raycast threshold; bumped via per-instance setting on Line2 if needed.
raycaster.params.Line = { threshold: 0.2 };

const listeners: Array<(active: boolean) => void> = [];
const selectionListeners: Array<(id: string | null) => void> = [];

export function isActive(): boolean {
  return active;
}

export function getSelectedId(): string | null {
  return selectedId;
}

export function onActiveChange(fn: (active: boolean) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function onSelectionChange(fn: (id: string | null) => void): () => void {
  selectionListeners.push(fn);
  return () => {
    const i = selectionListeners.indexOf(fn);
    if (i >= 0) selectionListeners.splice(i, 1);
  };
}

function notifyActiveChange(): void {
  for (const fn of listeners) fn(active);
}

function notifySelectionChange(): void {
  for (const fn of selectionListeners) fn(selectedId);
}

export function activate(): void {
  if (active) return;
  forceDeactivatePaint();
  forceDeactivatePen({ keepSession: false });
  forceDeactivateText({ keepSession: false });
  // Select doesn't have a session plane — each annotation has its own.
  hidePlaneOutline();
  endSession();

  active = true;
  const canvas = getRenderer().domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);
  canvas.style.cursor = 'default';

  notifyActiveChange();
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  dragging = false;
  selectedId = null;
  notifySelectionChange();

  const canvas = getRenderer().domElement;
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerUp);
  document.removeEventListener('keydown', onKeyDown);
  canvas.style.cursor = '';

  notifyActiveChange();
}

export function forceDeactivate(): void {
  if (active) deactivate();
}

/** Restore the viewport camera to the angle from which the given annotation
 *  was originally drawn. Returns true if the annotation exists. */
export function restoreView(id: string): boolean {
  const a = getAnnotationById(id);
  if (!a) return false;
  restoreCameraView(a.camera);
  return true;
}

function setSelection(id: string | null): void {
  if (selectedId === id) return;
  selectedId = id;
  notifySelectionChange();
}

function pickAnnotationAt(event: PointerEvent): Annotation | null {
  const overlay = getOverlayGroup();
  if (!overlay) return null;
  const canvas = getRenderer().domElement;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;
  const ndc = new THREE.Vector2(
    (x / rect.width) * 2 - 1,
    -(y / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, getCamera());

  const hits = raycaster.intersectObjects(overlay.children, false);
  for (const hit of hits) {
    const id = (hit.object.userData as { annotationId?: string })?.annotationId;
    if (!id) continue;
    const ann = getAnnotationById(id);
    if (ann) return ann;
  }
  return null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const ann = pickAnnotationAt(event);
  if (!ann) {
    setSelection(null);
    return;
  }
  setSelection(ann.id);

  // Begin drag against the annotation's stored plane.
  const plane = sessionToPlane(ann.plane);
  const start = screenToPlane(event, plane);
  if (!start) return;

  dragging = true;
  dragInitialIntersection = start;
  if (ann.type === 'stroke') {
    dragInitialStrokePoints = ann.points.map(p => p.clone());
    dragInitialTextAnchor = null;
  } else {
    dragInitialTextAnchor = ann.anchor.clone();
    dragInitialStrokePoints = null;
  }

  try { (event.target as Element).setPointerCapture?.(event.pointerId); } catch { /* */ }
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging || !selectedId || !dragInitialIntersection) return;
  const ann = getAnnotationById(selectedId);
  if (!ann) return;

  const plane = sessionToPlane(ann.plane);
  const cur = screenToPlane(event, plane);
  if (!cur) return;

  const delta = cur.clone().sub(dragInitialIntersection);
  if (ann.type === 'stroke' && dragInitialStrokePoints) {
    const moved = dragInitialStrokePoints.map(p => p.clone().add(delta));
    updateStrokePoints(ann.id, moved);
  } else if (ann.type === 'text' && dragInitialTextAnchor) {
    updateTextAnchor(ann.id, dragInitialTextAnchor.clone().add(delta));
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  dragInitialIntersection = null;
  dragInitialStrokePoints = null;
  dragInitialTextAnchor = null;
  try { (event.target as Element).releasePointerCapture?.(event.pointerId); } catch { /* */ }
}

function onKeyDown(e: KeyboardEvent): void {
  if (!active || !selectedId) return;
  // Ignore if user is typing in an input field elsewhere
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeAnnotationById(selectedId);
    setSelection(null);
  } else if (e.key === 'Escape') {
    setSelection(null);
  }
}
