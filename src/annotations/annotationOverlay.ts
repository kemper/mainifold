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
import { getStrokes, getTexts, onChange, type StrokeAnnotation, type TextAnnotation } from './annotations';

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
  // Defensive: never let resolution go to 0/0 — LineMaterial divides by it.
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  liveResolution.set(w, h);
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
  disposeGroupChildren(overlayGroup);
  for (const s of getStrokes()) {
    overlayGroup.add(strokeToLine2(s, liveResolution));
  }
  for (const t of getTexts()) {
    overlayGroup.add(textToSprite(t));
  }
  overlayGroup.visible = visible;
}

/** Build a fresh disposable group of Line2 + Sprite objects for an offscreen
 *  scene. `resolution` is the pixel size of the target render so LineMaterial
 *  can compute screen-space widths. Returns null if annotations are
 *  hidden or empty. */
export function buildStrokesGroup(resolution: THREE.Vector2): THREE.Group | null {
  if (!visible) return null;
  const strokes = getStrokes();
  const texts = getTexts();
  if (strokes.length === 0 && texts.length === 0) return null;
  const g = new THREE.Group();
  g.name = 'annotation-overlay-snapshot';
  for (const s of strokes) g.add(strokeToLine2(s, resolution));
  for (const t of texts) g.add(textToSprite(t));
  return g;
}

/** Dispose all Line2 + Sprite children of the group and empty it. */
export function disposeStrokesGroup(g: THREE.Group): void {
  disposeGroupChildren(g);
}

/** Build a Line2 for a stroke. Exported so annotateMode can use the same
 *  pipeline for the in-progress preview line. */
export function strokeToLine2(s: StrokeAnnotation, resolution: THREE.Vector2): Line2 {
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
  // While a stroke is being drawn, the bounding sphere from the initial
  // (often degenerate) point set may not match the live geometry. Skip
  // frustum culling so the line always renders during the drag.
  line.frustumCulled = false;
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

function disposeGroupChildren(g: THREE.Group): void {
  while (g.children.length > 0) {
    const child = g.children[0];
    g.remove(child);
    if (child instanceof Line2) {
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach(mm => mm.dispose());
      else m.dispose();
    } else if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}

/** Build a Sprite that renders the text annotation as a screen-facing label.
 *  The sprite uses sizeAttenuation: false so its on-screen size stays roughly
 *  constant regardless of camera distance. */
export function textToSprite(t: TextAnnotation): THREE.Sprite {
  const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const fontPx = Math.round(t.fontSizePx * dpr * 1.5); // texture font; oversample
  const padX = Math.round(fontPx * 0.4);
  const padY = Math.round(fontPx * 0.25);

  // Measure
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = `bold ${fontPx}px sans-serif`;
  const metrics = meas.measureText(t.text || ' ');
  const textWidth = Math.ceil(metrics.width);

  const cw = Math.max(2, textWidth + padX * 2);
  const ch = Math.max(2, fontPx + padY * 2);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Translucent dark pill behind the text for legibility on any background.
  const radius = Math.min(ch / 2, 24 * dpr);
  ctx.fillStyle = 'rgba(20, 20, 30, 0.78)';
  roundRect(ctx, 0, 0, cw, ch, radius);
  ctx.fill();

  ctx.fillStyle = `rgb(${Math.round(t.color[0] * 255)},${Math.round(t.color[1] * 255)},${Math.round(t.color[2] * 255)})`;
  ctx.fillText(t.text, cw / 2, ch / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    sizeAttenuation: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(t.anchor);
  // With sizeAttenuation: false, sprite.scale is in NDC × 2 units. We size by
  // fontSizePx as a fraction of a 1080-tall reference viewport so labels read
  // at a consistent pixel size across canvas sizes.
  const scaleY = (t.fontSizePx * 2) / 1080;
  const scaleX = scaleY * (cw / ch);
  sprite.scale.set(scaleX, scaleY, 1);
  sprite.center.set(0.5, -0.1); // anchor below the label so the surface point is visible
  sprite.renderOrder = 1001;
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
