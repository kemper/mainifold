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

    // Label as caption below canvas, not overlaid
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col min-h-0';

    canvas.className = 'w-full flex-1 block object-contain min-h-0';
    wrapper.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'text-center text-xs text-zinc-500 font-mono py-0.5 bg-zinc-800 shrink-0';
    label.textContent = view.name;
    wrapper.appendChild(label);

    grid.appendChild(wrapper);
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

  const labelHeight = 28;
  const cellHeight = viewSize + labelHeight;
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = 2 * viewSize;
  compositeCanvas.height = 2 * cellHeight;
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

    const x = col * viewSize;
    const y = row * cellHeight;
    ctx.drawImage(renderer.domElement, x, y);

    // Label below the view, not overlaid
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(x, y + viewSize, viewSize, labelHeight);
    ctx.fillStyle = '#333333';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(view.name, x + viewSize / 2, y + viewSize + 18);
    ctx.textAlign = 'start';
  });

  geometry.dispose();
  return compositeCanvas;
}

// === Orthographic elevation views ===

interface ElevationConfig {
  name: string;
  // Camera direction: where the camera looks FROM (multiplied by distance)
  direction: [number, number, number];
  up: [number, number, number];
}

const ELEVATIONS: ElevationConfig[] = [
  { name: 'Front',  direction: [0, -1, 0],  up: [0, 0, 1] },  // looking from -Y toward +Y
  { name: 'Right',  direction: [1, 0, 0],   up: [0, 0, 1] },  // looking from +X toward -X
  { name: 'Back',   direction: [0, 1, 0],   up: [0, 0, 1] },  // looking from +Y toward -Y
  { name: 'Left',   direction: [-1, 0, 0],  up: [0, 0, 1] },  // looking from -X toward +X
  { name: 'Top',    direction: [0, 0, 1],   up: [0, 1, 0] },  // looking from +Z down
];

function createElevationScene(geometry: THREE.BufferGeometry, bgColor: number): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
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
  return scene;
}

function setupOrthoCamera(
  bsize: THREE.Vector3, center: THREE.Vector3,
  elev: ElevationConfig, padding: number
): THREE.OrthographicCamera {
  // Determine visible extents based on viewing direction
  const dir = elev.direction;
  const upVec = elev.up;
  // Cross product to get the "right" vector
  const right = [
    upVec[1] * dir[2] - upVec[2] * dir[1],
    upVec[2] * dir[0] - upVec[0] * dir[2],
    upVec[0] * dir[1] - upVec[1] * dir[0],
  ];

  // Project bounding box onto right and up axes to get visible extents
  const bArr = [bsize.x, bsize.y, bsize.z];
  let hExtent = 0, vExtent = 0;
  for (let i = 0; i < 3; i++) {
    hExtent += Math.abs(right[i]) * bArr[i];
    vExtent += Math.abs(upVec[i]) * bArr[i];
  }
  const halfH = (hExtent / 2) * padding;
  const halfV = (vExtent / 2) * padding;
  const maxHalf = Math.max(halfH, halfV); // keep square aspect

  const camera = new THREE.OrthographicCamera(-maxHalf, maxHalf, maxHalf, -maxHalf, 0.1, 1000);
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  camera.position.set(
    center.x + dir[0] * maxDim * 2,
    center.y + dir[1] * maxDim * 2,
    center.z + dir[2] * maxDim * 2,
  );
  camera.up.set(upVec[0], upVec[1], upVec[2]);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}

/** Render orthographic elevation views (front, right, back, left, top) to a container */
export function renderElevationsToContainer(container: HTMLElement, meshData: MeshData): void {
  container.innerHTML = '';

  const geometry = meshDataToGeometry(meshData);
  const scene = createElevationScene(geometry, 0x1e1e2e);

  const box = new THREE.Box3().setFromBufferAttribute(
    geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  const center = box.getCenter(new THREE.Vector3());
  const bsize = box.getSize(new THREE.Vector3());

  const viewSize = 300;
  const renderer = getOffscreenRenderer(viewSize);

  // Use a grid: top row = Front, Right, Back; bottom row = Left, Top, (empty or isometric)
  const grid = document.createElement('div');
  grid.className = 'grid gap-1 w-full h-full';
  grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  grid.style.gridTemplateRows = 'repeat(2, 1fr)';

  for (const elev of ELEVATIONS) {
    const camera = setupOrthoCamera(bsize, center, elev, 1.3);
    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = viewSize;
    canvas.height = viewSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(renderer.domElement, 0, 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col min-h-0';
    canvas.className = 'w-full flex-1 block object-contain min-h-0';
    wrapper.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'text-center text-xs text-zinc-500 font-mono py-0.5 bg-zinc-800 shrink-0';
    label.textContent = elev.name;
    wrapper.appendChild(label);

    grid.appendChild(wrapper);
  }

  // Add one isometric view in the 6th slot for context
  {
    const isoCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
    const d = maxDim * 1.4;
    isoCamera.position.set(center.x + d, center.y - d, center.z + d);
    isoCamera.up.set(0, 0, 1);
    isoCamera.lookAt(center);
    isoCamera.updateProjectionMatrix();
    renderer.render(scene, isoCamera);

    const canvas = document.createElement('canvas');
    canvas.width = viewSize;
    canvas.height = viewSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(renderer.domElement, 0, 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col min-h-0';
    canvas.className = 'w-full flex-1 block object-contain min-h-0';
    wrapper.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'text-center text-xs text-zinc-500 font-mono py-0.5 bg-zinc-800 shrink-0';
    label.textContent = 'Isometric';
    wrapper.appendChild(label);

    grid.appendChild(wrapper);
  }

  container.appendChild(grid);
  geometry.dispose();
}

/** Render a single view from any camera angle. Returns a data URL (PNG).
 *  For orthographic views, pass ortho: true.
 *  elevation/azimuth are in degrees: elevation 0 = horizon, 90 = top-down.
 *  azimuth 0 = front (-Y), 90 = right (+X), 180 = back (+Y), 270 = left (-X). */
export function renderSingleView(meshData: MeshData, options: {
  elevation?: number;
  azimuth?: number;
  ortho?: boolean;
  size?: number;
} = {}): string {
  const elevation = (options.elevation ?? 30) * Math.PI / 180;
  const azimuth = (options.azimuth ?? 315) * Math.PI / 180;
  const viewSize = options.size ?? 500;

  const geometry = meshDataToGeometry(meshData);
  const scene = createElevationScene(geometry, 0xffffff);

  const box = new THREE.Box3().setFromBufferAttribute(
    geometry.getAttribute('position') as THREE.BufferAttribute,
  );
  const center = box.getCenter(new THREE.Vector3());
  const bsize = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const dist = maxDim * 2;

  // Spherical to cartesian (Z-up)
  const cx = dist * Math.cos(elevation) * Math.sin(azimuth);
  const cy = dist * Math.cos(elevation) * (-Math.cos(azimuth));
  const cz = dist * Math.sin(elevation);

  let camera: THREE.Camera;
  if (options.ortho) {
    const halfExtent = maxDim * 0.7;
    const orthoCamera = new THREE.OrthographicCamera(-halfExtent, halfExtent, halfExtent, -halfExtent, 0.1, 1000);
    orthoCamera.position.set(center.x + cx, center.y + cy, center.z + cz);
    orthoCamera.up.set(0, 0, 1);
    orthoCamera.lookAt(center);
    orthoCamera.updateProjectionMatrix();
    camera = orthoCamera;
  } else {
    const perspCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    perspCamera.position.set(center.x + cx, center.y + cy, center.z + cz);
    perspCamera.up.set(0, 0, 1);
    perspCamera.lookAt(center);
    perspCamera.updateProjectionMatrix();
    camera = perspCamera;
  }

  const renderer = getOffscreenRenderer(viewSize);
  renderer.render(scene, camera);

  const canvas = document.createElement('canvas');
  canvas.width = viewSize;
  canvas.height = viewSize;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(renderer.domElement, 0, 0);

  geometry.dispose();
  return canvas.toDataURL('image/png');
}

/** Render a cross-section at a given Z height as an SVG string */
export function renderSliceSVG(polygons: [number, number][][], boundingBox: { minX: number; maxX: number; minY: number; maxY: number }, size: number = 400): string {
  const { minX, maxX, minY, maxY } = boundingBox;
  const w = maxX - minX;
  const h = maxY - minY;
  const maxDim = Math.max(w, h);
  const padding = maxDim * 0.1;
  const vbX = minX - padding;
  const vbW = maxDim + padding * 2;
  const vbH = maxDim + padding * 2;

  let paths = '';
  for (const contour of polygons) {
    if (contour.length < 2) continue;
    // Flip Y for SVG (SVG Y goes down, our Y goes up)
    const d = contour.map((pt, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd}${pt[0].toFixed(2)},${(-pt[1]).toFixed(2)}`;
    }).join(' ') + ' Z';
    paths += `<path d="${d}" fill="#4a9eff" fill-opacity="0.3" stroke="#2563eb" stroke-width="${maxDim * 0.005}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vbX} ${-maxY - padding} ${vbW} ${vbH}" style="background:#1e1e2e">
    <rect x="${vbX}" y="${-maxY - padding}" width="${vbW}" height="${vbH}" fill="#1e1e2e"/>
    ${paths}
  </svg>`;
}
