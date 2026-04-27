// Annotation overlay — owns the THREE.Group attached to the live viewport scene
// and provides a builder that constructs disposable Line2 objects for offscreen
// scenes (multiview, renderSingleView, elevations, composite thumbnails).
//
// Uses Line2 (LineGeometry + LineMaterial) instead of plain THREE.Line so that
// strokes have a configurable pixel width — LineBasicMaterial.linewidth is
// hard-capped to 1px in WebGL.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { getStrokes, onChange, type AnnotationStroke } from './annotations';

let overlayGroup: THREE.Group | null = null;
let visible = true;
const visibilityListeners: Array<(visible: boolean) => void> = [];

// Live overlay tracks the viewport canvas size so LineMaterial can compute
// correct screen-space widths. setLiveResolution is called from viewport.ts
// on resize.
const liveResolution = new THREE.Vector2(1, 1);

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

export function getLiveResolution(): THREE.Vector2 {
  return liveResolution;
}

export function setLiveResolution(width: number, height: number): void {
  liveResolution.set(width, height);
  if (!overlayGroup) return;
  // Update existing Line2 materials so widths stay correct after resize.
  overlayGroup.traverse(obj => {
    if (obj instanceof Line2) {
      const mat = obj.material as LineMaterial;
      mat.resolution.copy(liveResolution);
    }
  });
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
    overlayGroup.add(strokeToLine2(s, liveResolution));
  }
  overlayGroup.visible = visible;
}

/** Build a fresh disposable group of Line2 objects for an offscreen scene.
 *  `resolution` is the pixel size of the target render so LineMaterial can
 *  compute screen-space widths. Returns null if annotations are hidden/empty. */
export function buildStrokesGroup(resolution: THREE.Vector2): THREE.Group | null {
  if (!visible) return null;
  const strokes = getStrokes();
  if (strokes.length === 0) return null;
  const g = new THREE.Group();
  g.name = 'annotation-strokes';
  for (const s of strokes) g.add(strokeToLine2(s, resolution));
  return g;
}

/** Dispose all Line2 children of the group and empty it. */
export function disposeStrokesGroup(g: THREE.Group): void {
  disposeGroupLines(g);
}

/** Build a Line2 for a stroke. Exported so annotateMode can use the same
 *  pipeline for the in-progress preview line. */
export function strokeToLine2(s: AnnotationStroke, resolution: THREE.Vector2): Line2 {
  const positions = pointsToFlatPositions(s.points);
  const geo = new LineGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color: new THREE.Color(s.color[0], s.color[1], s.color[2]).getHex(),
    linewidth: s.width,
    worldUnits: false,
    resolution: resolution.clone(),
    depthTest: true,
    transparent: true,
    dashed: false,
  });

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.renderOrder = 999;
  return line;
}

/** Update an existing Line2's geometry to a new point list. Cheap path used
 *  by the in-progress preview so we don't allocate a fresh Line2 per pointer
 *  sample. */
export function setLine2Points(line: Line2, points: THREE.Vector3[]): void {
  const positions = pointsToFlatPositions(points);
  const geo = line.geometry as LineGeometry;
  geo.setPositions(positions);
  line.computeLineDistances();
}

function pointsToFlatPositions(points: THREE.Vector3[]): number[] {
  // LineGeometry needs at least 2 points; if only 1, duplicate it so the
  // shader has a valid degenerate segment.
  if (points.length === 0) return [0, 0, 0, 0, 0, 0];
  if (points.length === 1) {
    const p = points[0];
    return [p.x, p.y, p.z, p.x, p.y, p.z];
  }
  const out = new Array<number>(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

function disposeGroupLines(g: THREE.Group): void {
  while (g.children.length > 0) {
    const child = g.children[0];
    g.remove(child);
    if (child instanceof Line2) {
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach(mm => mm.dispose());
      else m.dispose();
    }
  }
}
