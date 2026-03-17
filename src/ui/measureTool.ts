// Interactive measuring tool — click two points on model to measure distance
import * as THREE from 'three';
import { measureDistance } from '../geometry/rayCast';
import { showMeasurement, clearMeasurement, updateLabelPosition } from '../renderer/measureOverlay';

export interface MeasureState {
  active: boolean;
  point1: [number, number, number] | null;
  point2: [number, number, number] | null;
  distance: number | null;
}

type MeasureMode = 'inactive' | 'awaiting_p1' | 'awaiting_p2' | 'displaying';

let mode: MeasureMode = 'inactive';
let point1: THREE.Vector3 | null = null;
let point2: THREE.Vector3 | null = null;
let currentDistance: number | null = null;

let meshGroup: THREE.Group;
let cam: THREE.PerspectiveCamera;
let viewportContainer: HTMLElement;
let canvas: HTMLCanvasElement;
let clickHandler: ((e: MouseEvent) => void) | null = null;

export function initMeasureTool(
  canvasEl: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  group: THREE.Group,
  container: HTMLElement,
): void {
  canvas = canvasEl;
  cam = camera;
  meshGroup = group;
  viewportContainer = container;
}

export function activate(): void {
  if (mode !== 'inactive') return;
  mode = 'awaiting_p1';
  point1 = null;
  point2 = null;
  currentDistance = null;
  canvas.style.cursor = 'crosshair';

  clickHandler = handleClick;
  canvas.addEventListener('click', clickHandler);
}

export function deactivate(): void {
  mode = 'inactive';
  point1 = null;
  point2 = null;
  currentDistance = null;
  canvas.style.cursor = '';
  clearMeasurement();

  if (clickHandler) {
    canvas.removeEventListener('click', clickHandler);
    clickHandler = null;
  }
}

export function clear(): void {
  if (mode === 'displaying') {
    mode = 'awaiting_p1';
    point1 = null;
    point2 = null;
    currentDistance = null;
    canvas.style.cursor = 'crosshair';
    clearMeasurement();
  }
}

export function getState(): MeasureState {
  return {
    active: mode !== 'inactive',
    point1: point1 ? [point1.x, point1.y, point1.z] : null,
    point2: point2 ? [point2.x, point2.y, point2.z] : null,
    distance: currentDistance,
  };
}

export function refreshLabel(): void {
  if (mode === 'displaying' && point1 && point2) {
    updateLabelPosition(point1, point2);
  }
}

function handleClick(e: MouseEvent): void {
  if (mode === 'displaying') {
    // Clear and restart
    clear();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, cam);

  const intersections = raycaster.intersectObjects(meshGroup.children, true);
  if (intersections.length === 0) return;

  const hit = intersections[0].point;

  if (mode === 'awaiting_p1') {
    point1 = hit.clone();
    mode = 'awaiting_p2';
  } else if (mode === 'awaiting_p2' && point1) {
    point2 = hit.clone();
    currentDistance = measureDistance(
      [point1.x, point1.y, point1.z],
      [point2.x, point2.y, point2.z],
    );
    mode = 'displaying';
    canvas.style.cursor = '';

    showMeasurement(point1, point2, currentDistance, viewportContainer);
  }
}
