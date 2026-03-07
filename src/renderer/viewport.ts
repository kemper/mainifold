import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MeshData } from '../geometry/types';
import { createDefaultMaterial, createWireframeMaterial } from './materials';

let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let controls: OrbitControls;
let meshGroup: THREE.Group;
let animationId: number;

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
  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
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
    }
  }

  const geometry = meshGLToBufferGeometry(meshData);

  const solidMesh = new THREE.Mesh(geometry, createDefaultMaterial());
  const wireMesh = new THREE.Mesh(geometry, createWireframeMaterial());

  meshGroup.add(solidMesh);
  meshGroup.add(wireMesh);

  // Auto-frame the camera
  const box = new THREE.Box3().setFromObject(meshGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  controls.target.copy(center);
  camera.position.set(
    center.x + maxDim * 1.2,
    center.y - maxDim * 1.2,
    center.z + maxDim * 1.2,
  );
  controls.update();
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

export function dispose(): void {
  cancelAnimationFrame(animationId);
  controls.dispose();
  renderer.dispose();
}
