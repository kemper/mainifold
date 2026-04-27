// Session plane — when the user activates Annotate (pen or text sub-mode),
// we capture the current camera and freeze a virtual drawing plane in front
// of the model. All strokes/text from that activation are drawn on this
// plane via screen-to-plane unprojection. Re-activating Annotate creates a
// fresh plane based on the camera at the time of re-activation.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getCamera, getMeshGroup, getRenderer } from '../renderer/viewport';

// Plane offset = max(modelMaxDim * MODEL_FRACTION, cameraDistance * CAM_FRACTION).
// In practice this puts the plane just outside the model when the camera is
// close, and proportionally further out when the user has zoomed away.
const MODEL_FRACTION = 0.55; // just outside half-extent
const CAM_FRACTION = 0.05;   // 5% of camera-to-target distance (zoom-aware)

export interface SessionCamera {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

export interface SessionPlane {
  /** Unit normal pointing from plane toward the camera that created it. */
  normal: [number, number, number];
  /** A point on the plane (typically the projected model center). */
  origin: [number, number, number];
  /** Camera state captured at the time of creation. */
  camera: SessionCamera;
}

let activeSession: SessionPlane | null = null;
let outlineMesh: THREE.Line | null = null;
let outlineParent: THREE.Object3D | null = null;
let controlsRef: OrbitControls | null = null;

/** Wire up the OrbitControls reference so we can read the user's view target.
 *  Called once from viewport.ts. */
export function configureSessionPlane(controls: OrbitControls): void {
  controlsRef = controls;
}

export function getActiveSession(): SessionPlane | null {
  return activeSession;
}

export function startSession(): SessionPlane | null {
  if (!controlsRef) return null;
  const camera = getCamera();
  const meshGroup = getMeshGroup();

  // Model dimensions (handle empty viewport gracefully).
  const box = new THREE.Box3().setFromObject(meshGroup);
  let modelMaxDim = 1;
  let modelCenter = new THREE.Vector3();
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    modelMaxDim = Math.max(size.x, size.y, size.z, 1);
    box.getCenter(modelCenter);
  }

  const target = controlsRef.target.clone();
  const camPos = camera.position.clone();
  const toCam = camPos.clone().sub(target);
  const distance = toCam.length();
  const normal = toCam.clone().normalize();

  // Plane origin: in front of the model toward the camera.
  const offset = Math.max(modelMaxDim * MODEL_FRACTION, distance * CAM_FRACTION);
  const origin = (box.isEmpty() ? target : modelCenter).clone()
    .add(normal.clone().multiplyScalar(offset));

  activeSession = {
    normal: [normal.x, normal.y, normal.z],
    origin: [origin.x, origin.y, origin.z],
    camera: {
      position: [camPos.x, camPos.y, camPos.z],
      target: [target.x, target.y, target.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
    },
  };

  return activeSession;
}

export function endSession(): void {
  activeSession = null;
  hidePlaneOutline();
}

/** Unproject a pointer event's NDC coordinates to a 3D point on the active
 *  session plane. Returns null if no session is active or the cursor is
 *  outside the canvas. */
export function screenToActivePlane(event: PointerEvent | MouseEvent): THREE.Vector3 | null {
  if (!activeSession) return null;
  return screenToPlane(event, sessionToPlane(activeSession));
}

/** Same as screenToActivePlane but for a specific plane (used by select-mode
 *  drag against an annotation's stored plane). */
export function screenToPlane(event: PointerEvent | MouseEvent, plane: THREE.Plane): THREE.Vector3 | null {
  const canvas = getRenderer().domElement;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

  const ndc = new THREE.Vector2(
    (x / rect.width) * 2 - 1,
    -(y / rect.height) * 2 + 1,
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, getCamera());

  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return hit;
}

/** Build a THREE.Plane from a stored SessionPlane snapshot. */
export function sessionToPlane(s: SessionPlane): THREE.Plane {
  const n = new THREE.Vector3(s.normal[0], s.normal[1], s.normal[2]);
  const o = new THREE.Vector3(s.origin[0], s.origin[1], s.origin[2]);
  return new THREE.Plane(n, -n.dot(o));
}

/** Restore the camera to a stored annotation's view (snap, no animation). */
export function restoreCameraView(cam: SessionCamera): void {
  if (!controlsRef) return;
  const camera = getCamera();
  camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
  camera.up.set(cam.up[0], cam.up[1], cam.up[2]);
  controlsRef.target.set(cam.target[0], cam.target[1], cam.target[2]);
  controlsRef.update();
}

// ===== Plane outline visualization =====

/** Show a faint outline of the plane in the given parent group. Hides any
 *  previous outline first. Uses the camera's current frustum to size the
 *  rectangle so it covers what the user can see at the plane distance. */
export function showPlaneOutline(parent: THREE.Object3D): void {
  hidePlaneOutline();
  if (!activeSession) return;

  const camera = getCamera();
  // Make sure the camera's world matrix is current — it can lag behind a
  // recent OrbitControls.update() if we're called between render frames.
  camera.updateMatrixWorld();
  const planeData = activeSession;
  const origin = new THREE.Vector3(planeData.origin[0], planeData.origin[1], planeData.origin[2]);
  const normal = new THREE.Vector3(planeData.normal[0], planeData.normal[1], planeData.normal[2]);

  // Camera-aligned in-plane axes: use the camera's world right/up basis. Since
  // the plane normal is camera-to-target direction, camera right/up are exactly
  // the in-plane axes.
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());

  // Size so the rectangle roughly fills the viewport at the plane's distance.
  const distFromCam = camera.position.distanceTo(origin);
  let halfH: number, halfW: number;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const persp = camera as THREE.PerspectiveCamera;
    halfH = Math.tan((persp.fov * Math.PI) / 360) * distFromCam;
    halfW = halfH * persp.aspect;
  } else {
    const ortho = camera as unknown as THREE.OrthographicCamera;
    halfH = (ortho.top - ortho.bottom) / 2;
    halfW = (ortho.right - ortho.left) / 2;
  }
  // Suppress unused warning when normal already aligned to camera forward
  void normal;

  const tl = origin.clone().addScaledVector(right, -halfW).addScaledVector(up,  halfH);
  const tr = origin.clone().addScaledVector(right,  halfW).addScaledVector(up,  halfH);
  const br = origin.clone().addScaledVector(right,  halfW).addScaledVector(up, -halfH);
  const bl = origin.clone().addScaledVector(right, -halfW).addScaledVector(up, -halfH);

  const geo = new THREE.BufferGeometry().setFromPoints([tl, tr, br, bl, tl]);
  const mat = new THREE.LineBasicMaterial({
    color: 0x88aaff,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
  });
  outlineMesh = new THREE.Line(geo, mat);
  outlineMesh.name = 'annotation-session-plane';
  outlineMesh.renderOrder = 998;
  outlineMesh.frustumCulled = false;

  outlineParent = parent;
  parent.add(outlineMesh);
}

export function hidePlaneOutline(): void {
  if (outlineMesh && outlineParent) {
    outlineParent.remove(outlineMesh);
    outlineMesh.geometry.dispose();
    (outlineMesh.material as THREE.Material).dispose();
  }
  outlineMesh = null;
  outlineParent = null;
}
