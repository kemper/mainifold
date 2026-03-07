import * as THREE from 'three';
import { createWhiteMaterial, createBlackWireframeMaterial } from './materials';
import type { MeshData } from '../geometry/types';

interface ViewConfig {
  name: string;
  position: (d: number) => [number, number, number];
  up: [number, number, number];
}

// 4 isometric angles from alternating cube corners — every face visible in 3+ views
const VIEWS: ViewConfig[] = [
  { name: 'Upper Front-Right', position: (d) => [d, -d, d],     up: [0, 0, 1] },
  { name: 'Upper Back-Left',   position: (d) => [-d, d, d],     up: [0, 0, 1] },
  { name: 'Under Front-Left',  position: (d) => [-d, -d, -d],   up: [0, 0, 1] },
  { name: 'Under Back-Right',  position: (d) => [d, d, -d],     up: [0, 0, 1] },
];

function meshDataToGeometry(meshData: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(meshData.numVert * 3);
  for (let i = 0; i < meshData.numVert; i++) {
    positions[i * 3] = meshData.vertProperties[i * meshData.numProp];
    positions[i * 3 + 1] = meshData.vertProperties[i * meshData.numProp + 1];
    positions[i * 3 + 2] = meshData.vertProperties[i * meshData.numProp + 2];
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(meshData.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}

let offRenderer: THREE.WebGLRenderer | null = null;

function getOffscreenRenderer(size: number): THREE.WebGLRenderer {
  if (!offRenderer) {
    offRenderer = new THREE.WebGLRenderer({ antialias: true });
    offRenderer.setPixelRatio(1);
  }
  offRenderer.setSize(size, size);
  return offRenderer;
}

export function renderViewsToContainer(container: HTMLElement, meshData: MeshData): void {
  container.innerHTML = '';

  const geometry = meshDataToGeometry(meshData);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1e2e);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
  dir1.position.set(10, -10, 15);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-10, 10, -5);
  scene.add(dir2);

  const solidMesh = new THREE.Mesh(geometry, createWhiteMaterial());
  const wireMesh = new THREE.Mesh(geometry, createBlackWireframeMaterial());
  scene.add(solidMesh);
  scene.add(wireMesh);

  const box = new THREE.Box3().setFromBufferAttribute(
    geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  const center = box.getCenter(new THREE.Vector3());
  const bsize = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const d = maxDim * 1.4;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  const viewSize = 300;
  const renderer = getOffscreenRenderer(viewSize);

  // 2x2 grid that fills the container
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 grid-rows-2 gap-1 w-full h-full';

  for (const view of VIEWS) {
    const pos = view.position(d);
    camera.position.set(center.x + pos[0], center.y + pos[1], center.z + pos[2]);
    camera.up.set(view.up[0], view.up[1], view.up[2]);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = viewSize;
    canvas.height = viewSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(renderer.domElement, 0, 0);

    // Label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, viewSize, 20);
    ctx.fillStyle = '#a0a0b0';
    ctx.font = '12px monospace';
    ctx.fillText(view.name, 4, 14);

    canvas.className = 'w-full h-full block object-contain';
    grid.appendChild(canvas);
  }

  container.appendChild(grid);
  geometry.dispose();
}

export function renderCompositeCanvas(meshData: MeshData): HTMLCanvasElement {
  const geometry = meshDataToGeometry(meshData);
  const viewSize = 500;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(10, -10, 15);
  scene.add(dir);

  const solidMesh = new THREE.Mesh(geometry, createWhiteMaterial());
  const wireMesh = new THREE.Mesh(geometry, createBlackWireframeMaterial());
  scene.add(solidMesh);
  scene.add(wireMesh);

  const box = new THREE.Box3().setFromBufferAttribute(
    geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  const center = box.getCenter(new THREE.Vector3());
  const bsize = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const d = maxDim * 1.4;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  const renderer = getOffscreenRenderer(viewSize);

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = 2 * viewSize;
  compositeCanvas.height = 2 * viewSize;
  const ctx = compositeCanvas.getContext('2d')!;
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

  VIEWS.forEach((view, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);

    const pos = view.position(d);
    camera.position.set(center.x + pos[0], center.y + pos[1], center.z + pos[2]);
    camera.up.set(view.up[0], view.up[1], view.up[2]);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, col * viewSize, row * viewSize);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(col * viewSize, row * viewSize, 160, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.fillText(view.name, col * viewSize + 8, row * viewSize + 17);
  });

  geometry.dispose();
  return compositeCanvas;
}
