// Annotation strokes store — module-level state for freehand surface marks
// drawn by the user to communicate intent to the AI.

import * as THREE from 'three';

export interface AnnotationStroke {
  id: string;
  points: THREE.Vector3[]; // surface points, slightly offset along the hit normal
  color: [number, number, number]; // 0..1
}

let strokes: AnnotationStroke[] = [];
const listeners: Array<() => void> = [];

export function getStrokes(): readonly AnnotationStroke[] {
  return strokes;
}

export function getCount(): number {
  return strokes.length;
}

export function addStroke(stroke: AnnotationStroke): void {
  strokes.push(stroke);
  notify();
}

export function removeLastStroke(): AnnotationStroke | null {
  const popped = strokes.pop() ?? null;
  if (popped) notify();
  return popped;
}

export function clearStrokes(): void {
  if (strokes.length === 0) return;
  strokes = [];
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
