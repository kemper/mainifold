// Measurement visualization — line + label overlay in viewport
import * as THREE from 'three';
import { formatDimension } from '../geometry/units';

let measureGroup: THREE.Group | null = null;
let labelEl: HTMLElement | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;

export function initMeasureOverlay(
  scene: THREE.Scene,
  cam: THREE.PerspectiveCamera,
  ren: THREE.WebGLRenderer,
): void {
  camera = cam;
  renderer = ren;

  measureGroup = new THREE.Group();
  measureGroup.name = 'measure-overlay';
  scene.add(measureGroup);
}

export function showMeasurement(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  distance: number,
  container: HTMLElement,
): void {
  clearMeasurement();
  if (!measureGroup || !camera || !renderer) return;

  // Dashed line between points
  const points = [p1, p2];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: 0xffdd00,
    dashSize: 0.5,
    gapSize: 0.25,
    depthTest: false,
    linewidth: 2,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 999;
  measureGroup.add(line);

  // Small spheres at endpoints
  const sphereGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, depthTest: false });
  const s1 = new THREE.Mesh(sphereGeo, sphereMat);
  s1.position.copy(p1);
  s1.renderOrder = 999;
  measureGroup.add(s1);
  const s2 = new THREE.Mesh(sphereGeo, sphereMat);
  s2.position.copy(p2);
  s2.renderOrder = 999;
  measureGroup.add(s2);

  // HTML label positioned at midpoint
  labelEl = document.createElement('div');
  labelEl.className = 'absolute pointer-events-none px-2 py-1 rounded text-xs font-mono font-bold z-50';
  labelEl.style.cssText = 'background: rgba(255,221,0,0.9); color: #1a1a2e; transform: translate(-50%, -100%); white-space: nowrap;';
  labelEl.textContent = formatDimension(distance);
  container.style.position = 'relative';
  container.appendChild(labelEl);

  // Position label in screen space
  updateLabelPosition(p1, p2);
}

export function updateLabelPosition(p1?: THREE.Vector3, p2?: THREE.Vector3): void {
  if (!labelEl || !camera || !renderer || !p1 || !p2) return;

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const projected = mid.clone().project(camera);

  const canvas = renderer.domElement;
  const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
  const y = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;

  labelEl.style.left = `${x}px`;
  labelEl.style.top = `${y}px`;
}

export function clearMeasurement(): void {
  if (measureGroup) {
    while (measureGroup.children.length > 0) {
      const child = measureGroup.children[0];
      measureGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }
  if (labelEl) {
    labelEl.remove();
    labelEl = null;
  }
}
