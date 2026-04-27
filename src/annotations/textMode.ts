// Text-annotation mode — single-click to place an editable text input at a
// surface anchor. Pressing Enter commits the text as a TextAnnotation; Escape
// cancels.

import * as THREE from 'three';
import { addText, type TextAnnotation } from './annotations';
import {
  getMeshGroup,
  getCamera,
  getRenderer,
  setUserOrbitLock,
  isUserOrbitLocked,
} from '../renderer/viewport';
import { forceDeactivate as forceDeactivatePaint } from '../color/paintUI';
import { forceDeactivate as forceDeactivateAnnotateStrokes } from './annotateUI';

const NORMAL_OFFSET_FRAC = 0.005;
const DEFAULT_COLOR: [number, number, number] = [0.95, 0.20, 0.45];
const DEFAULT_FONT_SIZE = 28;

let active = false;
let priorOrbitLock = false;
let currentColor: [number, number, number] = [...DEFAULT_COLOR] as [number, number, number];
let currentFontSize = DEFAULT_FONT_SIZE;

let activeInput: HTMLInputElement | null = null;
let activeAnchor: THREE.Vector3 | null = null;

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const tmpBox = new THREE.Box3();
const tmpVec = new THREE.Vector3();

const listeners: Array<(active: boolean) => void> = [];

export function isActive(): boolean {
  return active;
}

export function getColor(): [number, number, number] {
  return [...currentColor] as [number, number, number];
}

export function setColor(c: [number, number, number]): void {
  currentColor = [c[0], c[1], c[2]];
}

export function getFontSize(): number {
  return currentFontSize;
}

export function setFontSize(px: number): void {
  currentFontSize = px;
}

export function onActiveChange(fn: (active: boolean) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function notifyActiveChange(): void {
  for (const fn of listeners) fn(active);
}

export function activate(): void {
  if (active) return;
  forceDeactivatePaint();
  forceDeactivateAnnotateStrokes();

  active = true;
  priorOrbitLock = isUserOrbitLocked();
  setUserOrbitLock(true);

  const canvas = getRenderer().domElement;
  canvas.addEventListener('click', onCanvasClick);
  canvas.style.cursor = 'text';

  notifyActiveChange();
}

export function deactivate(): void {
  if (!active) return;
  active = false;
  cancelInProgress();
  if (!priorOrbitLock) setUserOrbitLock(false);

  const canvas = getRenderer().domElement;
  canvas.removeEventListener('click', onCanvasClick);
  canvas.style.cursor = '';

  notifyActiveChange();
}

export function forceDeactivate(): void {
  if (active) deactivate();
}

function cancelInProgress(): void {
  removeInput();
  activeAnchor = null;
}

function removeInput(): void {
  if (!activeInput) return;
  activeInput.remove();
  activeInput = null;
}

function setMouseFromEvent(event: MouseEvent, canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) return false;
  mouseNDC.x = (x / rect.width) * 2 - 1;
  mouseNDC.y = -(y / rect.height) * 2 + 1;
  return true;
}

function modelMaxDim(): number {
  tmpBox.setFromObject(getMeshGroup());
  const size = tmpBox.getSize(tmpVec);
  return Math.max(size.x, size.y, size.z, 1);
}

function raycastSurface(event: MouseEvent): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  const canvas = getRenderer().domElement;
  if (!setMouseFromEvent(event, canvas)) return null;
  raycaster.setFromCamera(mouseNDC, getCamera());

  const meshGroup = getMeshGroup();
  const solid = meshGroup.children[0];
  if (!(solid instanceof THREE.Mesh)) return null;

  const hits = raycaster.intersectObject(solid);
  if (hits.length === 0 || !hits[0].face) return null;

  const hit = hits[0];
  if (!hit.face) return null;
  const normal = hit.face.normal.clone()
    .transformDirection(hit.object.matrixWorld)
    .normalize();
  return { point: hit.point.clone(), normal };
}

function onCanvasClick(event: MouseEvent): void {
  if (event.button !== 0) return;
  const hit = raycastSurface(event);
  if (!hit) return;

  const dim = modelMaxDim();
  const anchor = hit.point.clone().addScaledVector(hit.normal, dim * NORMAL_OFFSET_FRAC);

  // If an input is already open from a prior click, commit/discard it first.
  if (activeInput) commitFromInput();

  activeAnchor = anchor;
  showInputAt(event.clientX, event.clientY);
  event.preventDefault();
}

function showInputAt(clientX: number, clientY: number): void {
  // Place a small floating input at the click point. The input is appended
  // to body so it overlays everything; positioning uses page coords.
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type label, Enter to add';
  input.maxLength = 100;
  input.className = 'fixed z-[100] px-2 py-1 text-xs font-mono bg-zinc-900/95 text-white border border-pink-400/70 rounded shadow-xl outline-none focus:ring-2 focus:ring-pink-400/50';
  input.style.left = `${Math.round(clientX)}px`;
  input.style.top = `${Math.round(clientY - 10)}px`;
  input.style.transform = 'translate(-50%, -100%)';
  input.style.minWidth = '160px';

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitFromInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInProgress();
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => {
    // Commit on blur if there's text; otherwise drop the input.
    if (input.value.trim()) commitFromInput();
    else cancelInProgress();
  });

  document.body.appendChild(input);
  activeInput = input;
  // Defer focus so the click that placed the input doesn't immediately blur it.
  setTimeout(() => input.focus(), 0);
}

function commitFromInput(): void {
  if (!activeInput || !activeAnchor) {
    cancelInProgress();
    return;
  }
  const text = activeInput.value.trim();
  removeInput();
  if (!text) {
    activeAnchor = null;
    return;
  }
  const ann: TextAnnotation = {
    type: 'text',
    id: makeId(),
    anchor: activeAnchor,
    text,
    color: [...currentColor] as [number, number, number],
    fontSizePx: currentFontSize,
  };
  activeAnchor = null;
  addText(ann);
}

function makeId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Programmatic add — used by the console API. Anchor is in world coords. */
export function addTextAnnotationAtAnchor(opts: {
  anchor: [number, number, number];
  text: string;
  color?: [number, number, number];
  fontSizePx?: number;
}): TextAnnotation {
  const ann: TextAnnotation = {
    type: 'text',
    id: makeId(),
    anchor: new THREE.Vector3(opts.anchor[0], opts.anchor[1], opts.anchor[2]),
    text: opts.text,
    color: opts.color ?? ([...currentColor] as [number, number, number]),
    fontSizePx: opts.fontSizePx ?? currentFontSize,
  };
  addText(ann);
  return ann;
}
