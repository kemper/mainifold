// Annotation store — module-level state for surface marks (freehand strokes
// and pinned text labels) drawn by the user to communicate intent to the AI.

import * as THREE from 'three';

export interface StrokeAnnotation {
  type: 'stroke';
  id: string;
  points: THREE.Vector3[]; // surface points, slightly offset along the hit normal
  color: [number, number, number]; // 0..1
  width: number; // line width in screen-space pixels
}

export interface TextAnnotation {
  type: 'text';
  id: string;
  anchor: THREE.Vector3; // surface anchor point (offset along hit normal)
  text: string;
  color: [number, number, number]; // 0..1
  fontSizePx: number; // target on-screen font size in pixels
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

export function removeLastStroke(): StrokeAnnotation | null {
  // Pop the most recent stroke specifically (skips trailing texts).
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
