// Annotation overlay — owns the THREE.Group attached to the live viewport scene
// and provides a builder that constructs disposable Line objects for offscreen
// scenes (multiview, renderSingleView, elevations, composite thumbnails).

import * as THREE from 'three';
import { getStrokes, onChange, type AnnotationStroke } from './annotations';

let overlayGroup: THREE.Group | null = null;
let visible = true;
const visibilityListeners: Array<(visible: boolean) => void> = [];

export function initAnnotationOverlay(scene: THREE.Scene): THREE.Group {
  overlayGroup = new THREE.Group();
  overlayGroup.name = 'annotation-overlay';
  overlayGroup.visible = visible;
  scene.add(overlayGroup);
  rebuildLiveOverlay();
  onChange(rebuildLiveOverlay);
  return overlayGroup;
}

export function getOverlayGroup(): THREE.Group | null {
  return overlayGroup;
}

export function setAnnotationsVisible(v: boolean): void {
  if (visible === v) return;
  visible = v;
  if (overlayGroup) overlayGroup.visible = v;
  for (const fn of visibilityListeners) fn(v);
}

export function isAnnotationsVisible(): boolean {
  return visible;
}

export function onVisibilityChange(fn: (visible: boolean) => void): () => void {
  visibilityListeners.push(fn);
  return () => {
    const i = visibilityListeners.indexOf(fn);
    if (i >= 0) visibilityListeners.splice(i, 1);
  };
}

function rebuildLiveOverlay(): void {
  if (!overlayGroup) return;
  disposeGroupLines(overlayGroup);
  for (const s of getStrokes()) {
    overlayGroup.add(strokeToLine(s));
  }
  overlayGroup.visible = visible;
}

/** Build a fresh disposable group of Line objects for an offscreen scene.
 *  Returns null if annotations are hidden or empty (caller can skip). */
export function buildStrokesGroup(): THREE.Group | null {
  if (!visible) return null;
  const strokes = getStrokes();
  if (strokes.length === 0) return null;
  const g = new THREE.Group();
  g.name = 'annotation-strokes';
  for (const s of strokes) g.add(strokeToLine(s));
  return g;
}

/** Dispose all geometries and materials of Line children in the group, then empty it. */
export function disposeStrokesGroup(g: THREE.Group): void {
  disposeGroupLines(g);
}

function strokeToLine(s: AnnotationStroke): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(s.points);
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(s.color[0], s.color[1], s.color[2]),
    depthTest: true,
    transparent: true,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 999;
  return line;
}

function disposeGroupLines(g: THREE.Group): void {
  while (g.children.length > 0) {
    const child = g.children[0];
    g.remove(child);
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach(mm => mm.dispose());
      else m.dispose();
    }
  }
}
