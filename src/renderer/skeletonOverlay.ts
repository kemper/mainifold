// Wire-and-spheres scaffold overlay. Always renders on top (depthTest off,
// renderOrder 999) so it reads against the model.

import * as THREE from 'three';

export interface SkeletonNode {
  point: [number, number, number];
  radius?: number;
  color?: number | string;
  label?: string;
}

export interface SkeletonOptions {
  nodes: SkeletonNode[];
  edges?: Array<[number, number]>;
  lineColor?: number | string;
  lineWidth?: number;
  defaultRadius?: number;
  defaultColor?: number | string;
}

let skeletonGroup: THREE.Group | null = null;
let currentOptions: SkeletonOptions | null = null;

export function initSkeletonOverlay(scene: THREE.Scene): void {
  skeletonGroup = new THREE.Group();
  skeletonGroup.name = 'skeleton-overlay';
  scene.add(skeletonGroup);
}

function clearChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      // Each material is per-instance; dispose it. Geometry might be a
      // shared sphere (see populateSkeleton) — disposed once at the end
      // via the _sharedSkeletonGeometry tag.
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else if (mat) mat.dispose();
      // Lines own their own geometry; spheres share. Always dispose
      // line geometries here; sphere geometry is disposed below.
      if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        child.geometry.dispose();
      }
    }
  }
  const tagged = group as THREE.Group & { _sharedSkeletonGeometry?: THREE.BufferGeometry };
  if (tagged._sharedSkeletonGeometry) {
    tagged._sharedSkeletonGeometry.dispose();
    delete tagged._sharedSkeletonGeometry;
  }
}

/** Build a free-standing skeleton group for offscreen rendering. Caller
 *  owns its lifecycle and must call disposeTransientSkeleton when done. */
export function buildTransientSkeleton(opts: SkeletonOptions): THREE.Group | null {
  if (!opts.nodes || opts.nodes.length === 0) return null;
  const group = new THREE.Group();
  group.name = 'skeleton-overlay-transient';
  populateSkeleton(group, opts);
  return group;
}

export function disposeTransientSkeleton(group: THREE.Group): void {
  clearChildren(group);
}

function populateSkeleton(group: THREE.Group, opts: SkeletonOptions): void {
  const defaultRadius = opts.defaultRadius ?? 0.35;
  const defaultColor: THREE.ColorRepresentation = opts.defaultColor ?? 0x00d0ff;
  const lineColor: THREE.ColorRepresentation = opts.lineColor ?? 0xffaa00;

  // Share one sphere geometry across all nodes; per-node scale via
  // mesh.scale.setScalar(radius). Each node still owns its own material
  // (different colors) so disposal works as before.
  const sharedSphere = new THREE.SphereGeometry(1, 16, 12);
  const spherePositions: THREE.Vector3[] = [];
  for (const node of opts.nodes) {
    const [x, y, z] = node.point;
    const radius = node.radius ?? defaultRadius;
    const mat = new THREE.MeshBasicMaterial({
      color: node.color ?? defaultColor,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(sharedSphere, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 999;
    group.add(mesh);
    spherePositions.push(new THREE.Vector3(x, y, z));
  }
  // Attach the shared geometry to the group so clearChildren disposes
  // it exactly once (along with each per-node material).
  (group as THREE.Group & { _sharedSkeletonGeometry?: THREE.BufferGeometry })._sharedSkeletonGeometry = sharedSphere;

  if (opts.edges && opts.edges.length > 0) {
    const linePoints: THREE.Vector3[] = [];
    for (const [a, b] of opts.edges) {
      if (a < 0 || b < 0 || a >= spherePositions.length || b >= spherePositions.length) continue;
      linePoints.push(spherePositions[a]);
      linePoints.push(spherePositions[b]);
    }
    if (linePoints.length > 0) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: lineColor,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
        linewidth: opts.lineWidth ?? 2,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.renderOrder = 999;
      group.add(lines);
    }
  }
}

export function setSkeleton(opts: SkeletonOptions): void {
  if (!skeletonGroup) return;
  clearChildren(skeletonGroup);
  currentOptions = opts;
  populateSkeleton(skeletonGroup, opts);
  window.dispatchEvent(new Event('skeleton-changed'));
}

export function clearSkeleton(): void {
  if (!skeletonGroup) return;
  clearChildren(skeletonGroup);
  currentOptions = null;
  window.dispatchEvent(new Event('skeleton-changed'));
}

export function getCurrentSkeleton(): SkeletonOptions | null {
  return currentOptions;
}

export function isSkeletonVisible(): boolean {
  return skeletonGroup?.visible ?? true;
}

export function setSkeletonVisible(on: boolean): void {
  if (!skeletonGroup || skeletonGroup.visible === on) return;
  skeletonGroup.visible = on;
  for (const fn of visibilityListeners) fn(on);
}

const visibilityListeners: Array<(visible: boolean) => void> = [];

export function onSkeletonVisibilityChange(fn: (visible: boolean) => void): () => void {
  visibilityListeners.push(fn);
  return () => {
    const i = visibilityListeners.indexOf(fn);
    if (i >= 0) visibilityListeners.splice(i, 1);
  };
}

export function hasSkeleton(): boolean {
  return currentOptions !== null && currentOptions.nodes.length > 0;
}

/** Validate + normalize an opts object for previewSkeleton. Used by both
 *  the console-side (window.partwright) and sandbox-side (api.previewSkeleton)
 *  entry points so error messages stay identical. Throws Error on bad input. */
export function validateSkeletonOptions(rawOpts: unknown, prefix: string): SkeletonOptions {
  if (!rawOpts || typeof rawOpts !== 'object') {
    throw new Error(`${prefix}: opts must be an object { nodes: [...], edges?: [...] }`);
  }
  const o = rawOpts as Record<string, unknown>;
  const allowed = ['nodes', 'edges', 'lineColor', 'lineWidth', 'defaultRadius', 'defaultColor'];
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) {
      throw new Error(`${prefix}: unknown key "${k}". Allowed: ${allowed.join(', ')}`);
    }
  }
  if (!Array.isArray(o.nodes) || o.nodes.length === 0) {
    throw new Error(`${prefix}.nodes: must be a non-empty array of {point:[x,y,z], radius?, color?, label?}`);
  }
  const nodes: SkeletonNode[] = [];
  for (let i = 0; i < o.nodes.length; i++) {
    const n = o.nodes[i];
    if (!n || typeof n !== 'object' || !Array.isArray((n as { point?: unknown }).point) || (n as { point: unknown[] }).point.length !== 3) {
      throw new Error(`${prefix}.nodes[${i}].point: must be [x, y, z]`);
    }
    const pt = (n as { point: unknown[] }).point;
    for (const c of pt) {
      if (typeof c !== 'number' || !Number.isFinite(c)) {
        throw new Error(`${prefix}.nodes[${i}].point: components must be finite numbers`);
      }
    }
    const nn = n as { radius?: unknown; color?: unknown; label?: unknown };
    if (nn.radius !== undefined && (typeof nn.radius !== 'number' || nn.radius < 0)) {
      throw new Error(`${prefix}.nodes[${i}].radius: must be a non-negative number when provided`);
    }
    if (nn.color !== undefined && typeof nn.color !== 'number' && typeof nn.color !== 'string') {
      throw new Error(`${prefix}.nodes[${i}].color: must be a number (0xRRGGBB) or CSS color string`);
    }
    if (nn.label !== undefined && typeof nn.label !== 'string') {
      throw new Error(`${prefix}.nodes[${i}].label: must be a string when provided`);
    }
    nodes.push({
      point: [pt[0] as number, pt[1] as number, pt[2] as number],
      radius: nn.radius as number | undefined,
      color: nn.color as number | string | undefined,
      label: nn.label as string | undefined,
    });
  }
  const edges: Array<[number, number]> = [];
  if (o.edges !== undefined) {
    if (!Array.isArray(o.edges)) throw new Error(`${prefix}.edges: must be an array of [i, j] index pairs`);
    for (let i = 0; i < o.edges.length; i++) {
      const e = o.edges[i];
      if (!Array.isArray(e) || e.length !== 2 || !Number.isInteger(e[0]) || !Number.isInteger(e[1])) {
        throw new Error(`${prefix}.edges[${i}]: must be [i, j] integer index pair`);
      }
      if (e[0] < 0 || e[1] < 0 || e[0] >= nodes.length || e[1] >= nodes.length) {
        throw new Error(`${prefix}.edges[${i}]: indices must be in [0, ${nodes.length})`);
      }
      edges.push([e[0] as number, e[1] as number]);
    }
  }
  if (o.lineColor !== undefined && typeof o.lineColor !== 'number' && typeof o.lineColor !== 'string') {
    throw new Error(`${prefix}.lineColor: must be a number (0xRRGGBB) or CSS color string`);
  }
  if (o.lineWidth !== undefined && (typeof o.lineWidth !== 'number' || o.lineWidth < 0)) {
    throw new Error(`${prefix}.lineWidth: must be a non-negative number when provided`);
  }
  if (o.defaultRadius !== undefined && (typeof o.defaultRadius !== 'number' || o.defaultRadius < 0)) {
    throw new Error(`${prefix}.defaultRadius: must be a non-negative number when provided`);
  }
  if (o.defaultColor !== undefined && typeof o.defaultColor !== 'number' && typeof o.defaultColor !== 'string') {
    throw new Error(`${prefix}.defaultColor: must be a number (0xRRGGBB) or CSS color string`);
  }
  return {
    nodes,
    edges,
    lineColor: o.lineColor as number | string | undefined,
    lineWidth: o.lineWidth as number | undefined,
    defaultRadius: o.defaultRadius as number | undefined,
    defaultColor: o.defaultColor as number | string | undefined,
  };
}
