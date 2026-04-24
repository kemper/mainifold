import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MeshData } from '../geometry/types';
import { createDefaultMaterial, createWireframeMaterial } from './materials';
import { initPhantomGroup } from './phantomGeometry';
import { initMeasureOverlay } from './measureOverlay';
import { initOrientationGizmo, renderGizmo, updateGizmo, disposeGizmo, isGizmoAnimating } from './orientationGizmo';
import { initDimensionLines, updateDimensionLines, disposeDimensionLines } from './dimensionLines';

let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let controls: OrbitControls;
let meshGroup: THREE.Group;
let animationId: number;

// Orbit lock state — orbit is disabled when any lock source is active
let measureLock = false;
let userLock = false;

// Clipping plane state
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // clips above Z
let clippingEnabled = false;
let clipZ = 0;
let modelBounds: { min: number; max: number } = { min: 0, max: 10 };

// Back-face cap material — shows the cut face in a different color
const capMaterial = new THREE.MeshPhongMaterial({
  color: 0xff6b6b,
  shininess: 20,
  side: THREE.BackSide,
  clippingPlanes: [clipPlane],
});

// Clip plane visualization — translucent disc at the cut height
let clipPlaneHelper: THREE.Mesh | null = null;

export function initViewport(container: HTMLElement): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
} {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(15, -15, 15);
  camera.up.set(0, 0, 1);

  const canvas = document.createElement('canvas');
  canvas.classList.add('viewport-canvas');
  canvas.id = 'viewport';
  container.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.localClippingEnabled = true;

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.target.set(0, 0, 0);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dir1.position.set(10, -10, 15);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-10, 10, -5);
  scene.add(dir2);

  // Grid on XY plane
  const grid = new THREE.GridHelper(40, 40, 0x444444, 0x333333);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  meshGroup = new THREE.Group();
  scene.add(meshGroup);

  // Phantom geometry group (for reference/fitment overlays)
  initPhantomGroup(scene);

  // Measure overlay group
  initMeasureOverlay(scene, camera, renderer);

  // Orientation gizmo (XYZ axes indicator)
  initOrientationGizmo(camera, canvas, controls);

  // Bounding box dimension annotations
  initDimensionLines(scene);

  // ResizeObserver
  const observer = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(container);

  // Animate
  const clock = new THREE.Clock();
  function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    updateGizmo(delta);
    controls.enabled = !measureLock && !userLock && !isGizmoAnimating();
    controls.update();
    renderer.render(scene, camera);
    renderGizmo(renderer);
  }
  animate();

  return { scene, camera, renderer };
}

export function updateMesh(meshData: MeshData): void {
  // Clear previous
  while (meshGroup.children.length > 0) {
    const child = meshGroup.children[0];
    meshGroup.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else if (mat) mat.dispose();
    }
  }

  const geometry = meshGLToBufferGeometry(meshData);

  const solidMat = createDefaultMaterial();
  const wireMat = createWireframeMaterial();

  // Apply clipping planes to materials
  if (clippingEnabled) {
    solidMat.clippingPlanes = [clipPlane];
    wireMat.clippingPlanes = [clipPlane];
  }

  const solidMesh = new THREE.Mesh(geometry, solidMat);
  const wireMesh = new THREE.Mesh(geometry, wireMat);

  meshGroup.add(solidMesh);
  meshGroup.add(wireMesh);

  // Back-face cap mesh (shows cut face when clipping)
  if (clippingEnabled) {
    const capGeometry = geometry.clone();
    const capMesh = new THREE.Mesh(capGeometry, capMaterial);
    capMesh.name = 'clip-cap';
    meshGroup.add(capMesh);
  }

  // Auto-frame the camera
  const box = new THREE.Box3().setFromObject(meshGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Update model bounds for clip slider
  modelBounds = { min: box.min.z, max: box.max.z };

  // Update bounding box dimension annotations
  updateDimensionLines(box);

  controls.target.copy(center);
  camera.position.set(
    center.x + maxDim * 1.2,
    center.y - maxDim * 1.2,
    center.z + maxDim * 1.2,
  );
  controls.update();

  // Update clip plane position if clipping
  if (clippingEnabled) {
    updateClipPlaneVisual();
  }
}

// === Clipping API ===

export function setClipping(enabled: boolean): void {
  clippingEnabled = enabled;

  meshGroup.children.forEach(child => {
    if (child instanceof THREE.Mesh) {
      if (child.name === 'clip-cap') {
        child.visible = enabled;
        return;
      }
      const mat = child.material as THREE.Material;
      if (mat) {
        (mat as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial).clippingPlanes = enabled ? [clipPlane] : [];
        mat.needsUpdate = true;
      }
    }
  });

  if (enabled) {
    // Default to 75% height on first enable
    if (clipZ === 0) {
      clipZ = modelBounds.min + (modelBounds.max - modelBounds.min) * 0.75;
    }
    clipPlane.constant = clipZ;

    // Add cap mesh if not present
    const hasCap = meshGroup.children.some(c => c.name === 'clip-cap');
    if (!hasCap) {
      const solidChild = meshGroup.children[0];
      if (solidChild instanceof THREE.Mesh) {
        const capGeometry = solidChild.geometry.clone();
        const capMesh = new THREE.Mesh(capGeometry, capMaterial);
        capMesh.name = 'clip-cap';
        meshGroup.add(capMesh);
      }
    }

    updateClipPlaneVisual();
  } else {
    removeClipPlaneVisual();
  }
}

export function setClipZ(z: number): void {
  clipZ = z;
  clipPlane.constant = z;
  updateClipPlaneVisual();
}

export function getClipState(): { enabled: boolean; z: number; min: number; max: number } {
  return { enabled: clippingEnabled, z: clipZ, min: modelBounds.min, max: modelBounds.max };
}

function updateClipPlaneVisual() {
  removeClipPlaneVisual();

  if (!clippingEnabled) return;

  // Create a translucent disc at the clip height
  const range = Math.max(modelBounds.max - modelBounds.min, 1);
  const radius = range * 1.5;
  const planeGeo = new THREE.CircleGeometry(radius, 64);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0xff6b6b,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  clipPlaneHelper = new THREE.Mesh(planeGeo, planeMat);
  clipPlaneHelper.name = 'clip-plane-helper';
  const box = new THREE.Box3().setFromObject(meshGroup);
  const center = box.getCenter(new THREE.Vector3());
  clipPlaneHelper.position.set(center.x, center.y, clipZ);
  // The disc lies in XY plane by default, which is what we want for Z-clipping
  scene.add(clipPlaneHelper);
}

function removeClipPlaneVisual() {
  if (clipPlaneHelper) {
    scene.remove(clipPlaneHelper);
    clipPlaneHelper.geometry.dispose();
    (clipPlaneHelper.material as THREE.Material).dispose();
    clipPlaneHelper = null;
  }
}

function meshGLToBufferGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(mesh.numVert * 3);

  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function getScene(): THREE.Scene {
  return scene;
}

export function getCamera(): THREE.PerspectiveCamera {
  return camera;
}

export function getRenderer(): THREE.WebGLRenderer {
  return renderer;
}

export function getCameraState(): { azimuth: number; elevation: number; distance: number; target: [number, number, number] } {
  const dir = camera.position.clone().sub(controls.target);
  const distance = Math.round(dir.length() * 100) / 100;
  const elevation = Math.round(Math.asin(dir.z / dir.length()) * 180 / Math.PI * 100) / 100;
  const azimuth = Math.round((((Math.atan2(dir.x, -dir.y) * 180 / Math.PI) % 360) + 360) % 360 * 100) / 100;
  return {
    azimuth,
    elevation,
    distance,
    target: [
      Math.round(controls.target.x * 100) / 100,
      Math.round(controls.target.y * 100) / 100,
      Math.round(controls.target.z * 100) / 100,
    ],
  };
}

export function getCanvas(): HTMLCanvasElement {
  return renderer.domElement;
}

export function getMeshGroup(): THREE.Group {
  return meshGroup;
}

// === Orbit lock API ===

function syncOrbitEnabled(): void {
  controls.enabled = !measureLock && !userLock && !isGizmoAnimating();
}

export function setMeasureLock(locked: boolean): void {
  measureLock = locked;
  syncOrbitEnabled();
}

export function setUserOrbitLock(locked: boolean): void {
  userLock = locked;
  syncOrbitEnabled();
}

export function isUserOrbitLocked(): boolean {
  return userLock;
}

export { setDimensionsVisible, isDimensionsVisible } from './dimensionLines';

export function dispose(): void {
  cancelAnimationFrame(animationId);
  disposeGizmo();
  disposeDimensionLines();
  controls.dispose();
  renderer.dispose();
}
