// Annotation store — module-level state for plane-anchored marks (freehand
// strokes and pinned text labels) drawn by the user to communicate intent
// to the AI. Each annotation captures the camera state at creation time so
// the user can later snap back to the original viewing angle.

import * as THREE from 'three';
import type { SessionCamera, SessionPlane } from './sessionPlane';

export interface StrokeAnnotation {
  type: 'stroke';
  id: string;
  points: THREE.Vector3[]; // 3D points on the session plane
  color: [number, number, number]; // 0..1
  width: number; // line width in screen-space pixels
  camera: SessionCamera; // camera at time of creation (for restore-view)
  plane: SessionPlane;   // plane data (for select-mode drag)
}

export interface TextAnnotation {
  type: 'text';
  id: string;
  anchor: THREE.Vector3; // 3D anchor on the session plane
  text: string;
  color: [number, number, number];
  fontSizePx: number;
  camera: SessionCamera;
  plane: SessionPlane;
}

export type Annotation = StrokeAnnotation | TextAnnotation;

let annotations: Annotation[] = [];
const listeners: Array<() => void> = [];

export function getAnnotations(): readonly Annotation[] {
  return annotations;
}

export function getStrokes(): readonly StrokeAnnotation[] {
  return annotations.filter((a): a is StrokeAnnotation => a.type === 'stroke');
}

export function getTexts(): readonly TextAnnotation[] {
  return annotations.filter((a): a is TextAnnotation => a.type === 'text');
}

export function getAnnotationById(id: string): Annotation | null {
  return annotations.find(a => a.id === id) ?? null;
}

export function getCount(): number {
  return annotations.length;
}

export function getStrokeCount(): number {
  return annotations.reduce((n, a) => n + (a.type === 'stroke' ? 1 : 0), 0);
}

export function getTextCount(): number {
  return annotations.reduce((n, a) => n + (a.type === 'text' ? 1 : 0), 0);
}

export function addStroke(stroke: StrokeAnnotation): void {
  annotations.push(stroke);
  notify();
}

export function addText(text: TextAnnotation): void {
  annotations.push(text);
  notify();
}

export function updateStrokePoints(id: string, points: THREE.Vector3[]): boolean {
  const a = annotations.find(x => x.id === id);
  if (!a || a.type !== 'stroke') return false;
  a.points = points;
  notify();
  return true;
}

export function updateTextAnchor(id: string, anchor: THREE.Vector3): boolean {
  const a = annotations.find(x => x.id === id);
  if (!a || a.type !== 'text') return false;
  a.anchor = anchor;
  notify();
  return true;
}

export function removeLastStroke(): StrokeAnnotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (a.type === 'stroke') {
      annotations.splice(i, 1);
      notify();
      return a;
    }
  }
  return null;
}

export function removeLastAnnotation(): Annotation | null {
  const popped = annotations.pop() ?? null;
  if (popped) notify();
  return popped;
}

export function removeAnnotationById(id: string): Annotation | null {
  const i = annotations.findIndex(a => a.id === id);
  if (i < 0) return null;
  const [removed] = annotations.splice(i, 1);
  notify();
  return removed;
}

export function clearStrokes(): void {
  const before = annotations.length;
  annotations = annotations.filter(a => a.type !== 'stroke');
  if (annotations.length !== before) notify();
}

export function clearTexts(): void {
  const before = annotations.length;
  annotations = annotations.filter(a => a.type !== 'text');
  if (annotations.length !== before) notify();
}

export function clearAll(): void {
  if (annotations.length === 0) return;
  annotations = [];
  notify();
}

export function onChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}
