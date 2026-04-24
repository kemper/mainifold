import './style.css';
import { initEngine, executeCode, executeCodeAsync, validateCodeAsync, ensureEngineReady, getModule, getActiveLanguage, setActiveLanguage, type Language } from './geometry/engine';
import { sliceAtZ, getBoundingBox } from './geometry/crossSection';
import { initViewport, updateMesh, setClipping, setClipZ, getClipState, getCameraState, getCanvas, getMeshGroup, getCamera, setMeasureLock, setUserOrbitLock, isUserOrbitLocked, setDimensionsVisible, isDimensionsVisible, setGridVisible, isGridVisible } from './renderer/viewport';
import { renderCompositeCanvas, renderElevationsToContainer, renderSingleView, renderSliceSVG, setReferenceImages as _setRefImages, clearReferenceImages as _clearRefImages, getReferenceImages as _getRefImages, type ReferenceImages } from './renderer/multiview';
import { setPhantom, clearPhantom, hasPhantom, type PhantomOptions } from './renderer/phantomGeometry';
import { initEditor, setValue, getValue, setLanguage as setEditorLanguage } from './editor/codeEditor';
import { createLayout } from './ui/layout';
import { createToolbar, isAutoRun, setToolbarLanguage } from './ui/toolbar';
import { createLandingPage } from './ui/landing';
import { createHelpPage } from './ui/help';
import { createNotFoundPage } from './ui/notFound';
import { initViewsPanel, updateMultiView } from './ui/panels';
import { createSessionBar } from './ui/sessionBar';
import { createGalleryView, refreshGallery } from './ui/gallery';
import { createNotesView, refreshNotes } from './ui/notes';
import { initSessionList, showSessionList } from './ui/sessionList';
import { exportGLB } from './export/gltf';
import { exportSTL } from './export/stl';
import { exportOBJ } from './export/obj';
import { export3MF } from './export/threemf';
import type { MeshData } from './geometry/types';
import { analyzeZProfile, type ZProfile } from './geometry/profileAnalysis';
import { probeAtXY, probeRay, measureDistance, type ProbeResult, type GeneralRayResult } from './geometry/rayCast';
import { checkContainment, type ContainmentWarning } from './geometry/containmentCheck';
import { setUnits as _setUnits, getUnits as _getUnits, type UnitSystem } from './geometry/units';
import { initMeasureTool, activate as activateMeasure, deactivate as deactivateMeasure, getState as getMeasureState } from './ui/measureTool';
import { maybeStartTour, resetTour, startTour } from './ui/tour';
import {
  getSessionIdFromURL,
  getVersionFromURL,
  isGalleryMode,
  openSession,
  createSession,
  closeSession,
  listSessions,
  deleteSession,
  renameSession,
  saveVersion,
  navigateVersion,
  loadVersion as loadVersionFromStore,
  peekVersion,
  listCurrentVersions,
  getState,
  getSessionUrl,
  getGalleryUrl,
  exportSession,
  importSession,
  clearAllSessions,
  saveReferenceImages as persistReferenceImages,
  getReferenceImagesFromSession,
  addSessionNote,
  listSessionNotes,
  deleteIfEmpty,
  deleteSessionNote,
  updateSessionNote,
  getSessionContext,
  recordError,
  onStateChange,
  type ExportedSession,
  type ReferenceImagesData,
} from './storage/sessionManager';

// Load examples as raw text — JS and SCAD
const jsExampleModules = import.meta.glob('../examples/*.js', { query: '?raw', import: 'default' });
const scadExampleModules = import.meta.glob('../examples/*.scad', { query: '?raw', import: 'default' });

export interface ExampleEntry {
  code: string;
  language: Language;
}

let currentMeshData: MeshData | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentManifold: any = null;

// #geometry-data element — always-updated machine-readable state
let geometryDataEl: HTMLElement;

// === Document title management ===
// Actively manage document.title to reflect current state.
// Some browser automation tools (MCP servers, extensions) can inadvertently
// replace the page title with JS evaluation results; this prevents that.
const BASE_TITLE = 'Partwright';
let _expectedTitle = 'Partwright — AI-Driven Parametric CAD in Your Browser';

function updateDocumentTitle(context?: { page?: 'landing' | 'editor' | 'help' | '404'; sessionName?: string | null }) {
  if (context?.page === 'landing' || context?.page === undefined && shouldShowLanding()) {
    _expectedTitle = `${BASE_TITLE} — AI-Driven Parametric CAD in Your Browser`;
  } else if (context?.page === 'help') {
    _expectedTitle = `Help — ${BASE_TITLE}`;
  } else if (context?.page === '404') {
    _expectedTitle = `Not Found — ${BASE_TITLE}`;
  } else {
    // Editor — include session name if available
    const name = context?.sessionName ?? getState().session?.name;
    _expectedTitle = name ? `${name} — ${BASE_TITLE}` : `Editor — ${BASE_TITLE}`;
  }
  document.title = _expectedTitle;
}

// Guard against external title mutations (e.g. browser automation eval results)
function installTitleGuard() {
  const titleEl = document.querySelector('title');
  if (!titleEl) return;
  new MutationObserver(() => {
    if (document.title !== _expectedTitle) {
      document.title = _expectedTitle;
    }
  }).observe(titleEl, { childList: true, characterData: true, subtree: true });
}

function createGeometryDataElement(): HTMLElement {
  const el = document.createElement('pre');
  el.id = 'geometry-data';
  el.className = 'sr-only';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '{}';
  document.body.appendChild(el);
  return el;
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeGeometryStats(manifold: any, meshData: MeshData, executionTimeMs?: number, sourceCode?: string): Record<string, unknown> {
  const bbox = getBoundingBox(manifold);

  let volume = 0;
  let surfaceArea = 0;
  try {
    volume = manifold.volume();
    surfaceArea = manifold.surfaceArea();
  } catch {
    // fallback if methods unavailable
  }

  const centroid = bbox
    ? [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2]
    : null;

  const dimensions = bbox
    ? [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]]
    : null;

  let componentCount = 1;
  try {
    const parts = manifold.decompose();
    componentCount = parts.length;
    for (const p of parts) p.delete();
  } catch {
    // fallback
  }

  let isManifold = true;
  let manifoldStatus: string | null = null;
  try {
    const s = manifold.status();
    isManifold = s === 0 || s === 'NoError';
    if (!isManifold) {
      // Surface the actual status for diagnostics
      manifoldStatus = String(s);
    }
  } catch {
    // fallback
  }

  const quartileSlices: Record<string, { z: number; area: number; contours: number }> = {};
  if (bbox) {
    const zRange = bbox.max[2] - bbox.min[2];
    for (const pct of [25, 50, 75]) {
      const z = bbox.min[2] + zRange * (pct / 100);
      const s = sliceAtZ(manifold, z);
      if (s) {
        quartileSlices[`z${pct}`] = { z, area: s.area, contours: s.polygons.length };
      }
    }
  }

  return {
    status: 'ok' as const,
    vertexCount: meshData.numVert,
    triangleCount: meshData.numTri,
    boundingBox: bbox ? {
      x: [bbox.min[0], bbox.max[0]],
      y: [bbox.min[1], bbox.max[1]],
      z: [bbox.min[2], bbox.max[2]],
      dimensions,
    } : null,
    centroid,
    volume,
    surfaceArea,
    genus: (() => { try { return manifold.genus(); } catch { return null; } })(),
    isManifold,
    ...(manifoldStatus ? { manifoldStatus } : {}),
    componentCount,
    crossSections: quartileSlices,
    unit: _getUnits(),
    executionTimeMs: executionTimeMs ?? null,
    codeHash: sourceCode ? simpleHash(sourceCode) : null,
  };
}

function computeStatDiff(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  const numericFields = ['volume', 'surfaceArea', 'vertexCount', 'triangleCount', 'genus', 'componentCount'];
  for (const field of numericFields) {
    const from = prev[field] as number;
    const to = next[field] as number;
    if (from !== undefined && to !== undefined) {
      const delta = to - from;
      if (delta === 0) {
        diff[field] = { from, to, delta: 'unchanged' };
      } else {
        const pct = from !== 0 ? ((delta / from) * 100).toFixed(1) : null;
        diff[field] = {
          from, to,
          delta: `${delta > 0 ? '+' : ''}${Math.round(delta)}${pct ? ` (${delta > 0 ? '+' : ''}${pct}%)` : ''}`,
        };
      }
    }
  }

  const prevBB = prev.boundingBox as Record<string, unknown> | null;
  const nextBB = next.boundingBox as Record<string, unknown> | null;
  if (prevBB?.dimensions && nextBB?.dimensions) {
    diff.boundingBox = { dimensions: { from: prevBB.dimensions, to: nextBB.dimensions } };
  }

  return diff;
}

interface GeometryAssertions {
  minVolume?: number;
  maxVolume?: number;
  isManifold?: boolean;
  maxComponents?: number;
  genus?: number;
  minGenus?: number;
  maxGenus?: number;
  minBounds?: [number, number, number];
  maxBounds?: [number, number, number];
  minTriangles?: number;
  maxTriangles?: number;
  /** Proportion range assertions: { widthToDepth: [min, max], widthToHeight: [min, max], depthToHeight: [min, max] } */
  boundsRatio?: {
    widthToDepth?: [number, number];
    widthToHeight?: [number, number];
    depthToHeight?: [number, number];
  };
  /** Optional notes to attach to this version (design rationale, user feedback, etc.) */
  notes?: string;
}

function checkAssertions(stats: Record<string, unknown>, assertions: GeometryAssertions): string[] {
  const failures: string[] = [];
  const v = stats.volume as number;
  const tc = stats.triangleCount as number;
  const cc = stats.componentCount as number;
  const g = stats.genus as number | null;
  const im = stats.isManifold as boolean;
  const bb = stats.boundingBox as { dimensions?: number[] } | null;

  if (assertions.minVolume !== undefined && v < assertions.minVolume)
    failures.push(`volume ${v.toFixed(1)} < minVolume ${assertions.minVolume}`);
  if (assertions.maxVolume !== undefined && v > assertions.maxVolume)
    failures.push(`volume ${v.toFixed(1)} > maxVolume ${assertions.maxVolume}`);
  if (assertions.isManifold !== undefined && im !== assertions.isManifold)
    failures.push(`isManifold is ${im}, expected ${assertions.isManifold}`);
  if (assertions.maxComponents !== undefined && cc > assertions.maxComponents)
    failures.push(`componentCount ${cc} > maxComponents ${assertions.maxComponents}`);
  if (assertions.genus !== undefined && g !== assertions.genus)
    failures.push(`genus ${g} !== expected ${assertions.genus}`);
  if (assertions.minGenus !== undefined && (g === null || g < assertions.minGenus))
    failures.push(`genus ${g} < minGenus ${assertions.minGenus}`);
  if (assertions.maxGenus !== undefined && (g === null || g > assertions.maxGenus))
    failures.push(`genus ${g} > maxGenus ${assertions.maxGenus}`);
  if (assertions.minTriangles !== undefined && tc < assertions.minTriangles)
    failures.push(`triangleCount ${tc} < minTriangles ${assertions.minTriangles}`);
  if (assertions.maxTriangles !== undefined && tc > assertions.maxTriangles)
    failures.push(`triangleCount ${tc} > maxTriangles ${assertions.maxTriangles}`);
  if (assertions.minBounds && bb?.dimensions) {
    const d = bb.dimensions;
    for (let i = 0; i < 3; i++) {
      if (d[i] < assertions.minBounds[i])
        failures.push(`dimension ${['X', 'Y', 'Z'][i]} ${d[i].toFixed(1)} < minBounds ${assertions.minBounds[i]}`);
    }
  }
  if (assertions.maxBounds && bb?.dimensions) {
    const d = bb.dimensions;
    for (let i = 0; i < 3; i++) {
      if (d[i] > assertions.maxBounds[i])
        failures.push(`dimension ${['X', 'Y', 'Z'][i]} ${d[i].toFixed(1)} > maxBounds ${assertions.maxBounds[i]}`);
    }
  }
  if (assertions.boundsRatio && bb?.dimensions) {
    const [w, dep, h] = bb.dimensions;
    const ratios: { name: string; value: number; range?: [number, number] }[] = [
      { name: 'widthToDepth', value: w / dep, range: assertions.boundsRatio.widthToDepth },
      { name: 'widthToHeight', value: w / h, range: assertions.boundsRatio.widthToHeight },
      { name: 'depthToHeight', value: dep / h, range: assertions.boundsRatio.depthToHeight },
    ];
    for (const r of ratios) {
      if (r.range) {
        if (r.value < r.range[0]) failures.push(`${r.name} ratio ${r.value.toFixed(2)} < min ${r.range[0]}`);
        if (r.value > r.range[1]) failures.push(`${r.name} ratio ${r.value.toFixed(2)} > max ${r.range[1]}`);
      }
    }
  }
  return failures;
}

function updateGeometryData(executionTimeMs?: number, sourceCode?: string) {
  if (!currentManifold || !currentMeshData) {
    geometryDataEl.textContent = JSON.stringify({ status: 'error', error: 'No geometry' });
    return;
  }

  const data = computeGeometryStats(currentManifold, currentMeshData, executionTimeMs, sourceCode);
  // Surface session URLs in geometry-data so they're accessible even when getGalleryUrl() is sandbox-blocked
  const state = getState();
  if (state.session) {
    (data as Record<string, unknown>).sessionId = state.session.id;
    (data as Record<string, unknown>).sessionUrl = getSessionUrl();
    (data as Record<string, unknown>).galleryUrl = getGalleryUrl();
  }
  geometryDataEl.textContent = JSON.stringify(data, null, 2);
}

function captureThumbnail(): Promise<Blob | null> {
  if (!currentMeshData) return Promise.resolve(null);
  try {
    const canvas = renderCompositeCanvas(currentMeshData);
    return new Promise(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png');
    });
  } catch {
    return Promise.resolve(null);
  }
}

function getGeometryDataObj(): Record<string, unknown> | null {
  try {
    return JSON.parse(geometryDataEl.textContent || '{}');
  } catch {
    return null;
  }
}

// === Argument validation helpers ==========================================
//
// Runtime type/shape validation for the window.partwright API. The public API
// is reachable from untyped callers (browser console, MCP-driven AI agents,
// automation scripts) so TypeScript's compile-time guarantees do not apply.
// These helpers enforce argument contracts explicitly, with chatty error
// messages pointing at /ai.md anchors so AI callers can self-correct.
//
// Convention:
//   • Methods that already return a value use { error: "..." } on failure.
//   • Void setters THROW so misuse is loud.
//   • No coercion — "5" is not a number; wrong types are rejected outright.

/** Thrown by assertion helpers on validation failure. Void setters let this
 *  propagate; value-returning methods catch via toValidationError(). */
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function describeValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (Array.isArray(val)) return `array(length=${val.length})`;
  if (typeof val === 'object') return 'object';
  if (typeof val === 'string') return `string("${val.length > 40 ? val.slice(0, 40) + '…' : val}")`;
  return `${typeof val}(${String(val)})`;
}

/** Run a validation function; if it throws ValidationError, return { error } instead. */
function guard<T>(fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (e: unknown) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}

interface AssertStringOpts { optional?: boolean; allowEmpty?: boolean }
function assertString(val: unknown, paramName: string, opts: AssertStringOpts = {}): string | undefined {
  if (val === undefined || val === null) {
    if (opts.optional) return undefined;
    throw new ValidationError(`${paramName} is required (expected string, got ${describeValue(val)}). See /ai.md#argument-validation`);
  }
  if (typeof val !== 'string') {
    throw new ValidationError(`${paramName} must be a string, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  if (!opts.allowEmpty && val.length === 0) {
    throw new ValidationError(`${paramName} must not be an empty string. See /ai.md#argument-validation`);
  }
  return val;
}

interface AssertNumberOpts { optional?: boolean; min?: number; max?: number; integer?: boolean }
function assertNumber(val: unknown, paramName: string, opts: AssertNumberOpts = {}): number | undefined {
  if (val === undefined || val === null) {
    if (opts.optional) return undefined;
    throw new ValidationError(`${paramName} is required (expected number, got ${describeValue(val)}). See /ai.md#argument-validation`);
  }
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new ValidationError(`${paramName} must be a finite number, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  if (opts.integer && !Number.isInteger(val)) {
    throw new ValidationError(`${paramName} must be an integer, got ${val}. See /ai.md#argument-validation`);
  }
  if (opts.min !== undefined && val < opts.min) {
    throw new ValidationError(`${paramName} must be >= ${opts.min}, got ${val}. See /ai.md#argument-validation`);
  }
  if (opts.max !== undefined && val > opts.max) {
    throw new ValidationError(`${paramName} must be <= ${opts.max}, got ${val}. See /ai.md#argument-validation`);
  }
  return val;
}

interface AssertBooleanOpts { optional?: boolean }
function assertBoolean(val: unknown, paramName: string, opts: AssertBooleanOpts = {}): boolean | undefined {
  if (val === undefined || val === null) {
    if (opts.optional) return undefined;
    throw new ValidationError(`${paramName} is required (expected boolean, got ${describeValue(val)}). See /ai.md#argument-validation`);
  }
  if (typeof val !== 'boolean') {
    throw new ValidationError(`${paramName} must be a boolean, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  return val;
}

interface AssertObjectOpts { optional?: boolean }
function assertObject(val: unknown, paramName: string, opts: AssertObjectOpts = {}): Record<string, unknown> | undefined {
  if (val === undefined || val === null) {
    if (opts.optional) return undefined;
    throw new ValidationError(`${paramName} is required (expected object, got ${describeValue(val)}). See /ai.md#argument-validation`);
  }
  if (typeof val !== 'object' || Array.isArray(val)) {
    throw new ValidationError(`${paramName} must be a plain object (not array/null), got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  return val as Record<string, unknown>;
}

function assertFunction(val: unknown, paramName: string): (...args: unknown[]) => unknown {
  if (typeof val !== 'function') {
    throw new ValidationError(`${paramName} must be a function, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  return val as (...args: unknown[]) => unknown;
}

function assertEnum<T extends string>(val: unknown, allowed: readonly T[], paramName: string): T {
  if (typeof val !== 'string' || !allowed.includes(val as T)) {
    throw new ValidationError(`${paramName} must be one of: ${allowed.map(a => `"${a}"`).join(' | ')}. Got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  return val as T;
}

/** Validate a fixed-length tuple of numbers (e.g. [x,y,z]). */
function assertNumberTuple(val: unknown, length: number, paramName: string): number[] {
  if (!Array.isArray(val)) {
    throw new ValidationError(`${paramName} must be an array of ${length} numbers, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  if (val.length !== length) {
    throw new ValidationError(`${paramName} must have exactly ${length} elements, got length=${val.length}. See /ai.md#argument-validation`);
  }
  for (let i = 0; i < length; i++) {
    if (typeof val[i] !== 'number' || !Number.isFinite(val[i])) {
      throw new ValidationError(`${paramName}[${i}] must be a finite number, got ${describeValue(val[i])}. See /ai.md#argument-validation`);
    }
  }
  return val as number[];
}

function assertArray(val: unknown, paramName: string): unknown[] {
  if (!Array.isArray(val)) {
    throw new ValidationError(`${paramName} must be an array, got ${describeValue(val)}. See /ai.md#argument-validation`);
  }
  return val;
}

/** Reject any keys on `obj` that are not in the `allowed` set.
 *  Catches typos like `{ widthToDeep: [1,2] }` that would otherwise be silently ignored. */
function assertNoUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], paramName: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`${paramName}.${key} is not a recognized field. Allowed: ${allowed.join(', ')}. See /ai.md#argument-validation`);
    }
  }
}

/** Validate a GeometryAssertions object shape. Throws ValidationError on failure. */
const ASSERTION_FIELDS = [
  'minVolume', 'maxVolume', 'isManifold', 'maxComponents', 'genus', 'minGenus', 'maxGenus',
  'minBounds', 'maxBounds', 'minTriangles', 'maxTriangles', 'boundsRatio', 'notes',
] as const;
const BOUNDS_RATIO_FIELDS = ['widthToDepth', 'widthToHeight', 'depthToHeight'] as const;

function validateAssertionsShape(assertions: unknown, paramName: string): void {
  const a = assertObject(assertions, paramName)!;
  assertNoUnknownKeys(a, ASSERTION_FIELDS, paramName);
  assertNumber(a.minVolume, `${paramName}.minVolume`, { optional: true });
  assertNumber(a.maxVolume, `${paramName}.maxVolume`, { optional: true });
  assertBoolean(a.isManifold, `${paramName}.isManifold`, { optional: true });
  assertNumber(a.maxComponents, `${paramName}.maxComponents`, { optional: true, min: 0, integer: true });
  assertNumber(a.genus, `${paramName}.genus`, { optional: true, integer: true });
  assertNumber(a.minGenus, `${paramName}.minGenus`, { optional: true, integer: true });
  assertNumber(a.maxGenus, `${paramName}.maxGenus`, { optional: true, integer: true });
  if (a.minBounds !== undefined) assertNumberTuple(a.minBounds, 3, `${paramName}.minBounds`);
  if (a.maxBounds !== undefined) assertNumberTuple(a.maxBounds, 3, `${paramName}.maxBounds`);
  assertNumber(a.minTriangles, `${paramName}.minTriangles`, { optional: true, min: 0, integer: true });
  assertNumber(a.maxTriangles, `${paramName}.maxTriangles`, { optional: true, min: 0, integer: true });
  assertString(a.notes, `${paramName}.notes`, { optional: true, allowEmpty: true });
  if (a.boundsRatio !== undefined) {
    const br = assertObject(a.boundsRatio, `${paramName}.boundsRatio`)!;
    assertNoUnknownKeys(br, BOUNDS_RATIO_FIELDS, `${paramName}.boundsRatio`);
    for (const k of BOUNDS_RATIO_FIELDS) {
      if (br[k] !== undefined) assertNumberTuple(br[k], 2, `${paramName}.boundsRatio.${k}`);
    }
  }
}

// ===========================================================================

/** Validate a { index } | { id } version-target arg. Returns a parsed descriptor
 *  or { error } with a caller-aware message. Exactly one of index/id must be set. */
function parseVersionTarget(
  target: unknown,
  caller: string,
): { kind: 'index'; value: number } | { kind: 'id'; value: string } | { error: string } {
  const usage = `${caller}(target, ...): target must be { index: number } or { id: string } from listVersions()`;
  if (target === null || typeof target !== 'object') {
    return { error: usage };
  }
  const { index, id } = target as { index?: unknown; id?: unknown };
  const hasIndex = index !== undefined;
  const hasId = id !== undefined;
  if (hasIndex && hasId) {
    return { error: `${caller}: pass either { index } or { id }, not both.` };
  }
  if (!hasIndex && !hasId) {
    return { error: usage };
  }
  if (hasIndex) {
    if (typeof index !== 'number' || !Number.isFinite(index)) {
      return { error: `${caller}: target.index must be a finite number (got ${typeof index}).` };
    }
    return { kind: 'index', value: index };
  }
  if (typeof id !== 'string' || id.length === 0) {
    return { error: `${caller}: target.id must be a non-empty string (got ${typeof id}).` };
  }
  return { kind: 'id', value: id };
}

// Determine which page to show based on URL path and query params
function shouldShowLanding(): boolean {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  // Landing if at root path AND no query params that indicate a specific view
  const isRootPath = path === '/' || path === '';
  return isRootPath && !params.has('view') && !params.has('session') && !params.has('gallery') && !params.has('notes');
}

function shouldShowHelp(): boolean {
  return window.location.pathname === '/help';
}

function shouldShow404(): boolean {
  const path = window.location.pathname;
  return path !== '/' && path !== '' && path !== '/help' && path !== '/editor';
}


// Hide landing/help and show the editor UI
function showEditorUI(landingEl: HTMLElement | null, helpEl: HTMLElement | null, editorUI: HTMLElement) {
  if (landingEl) landingEl.classList.add('hidden');
  if (helpEl) helpEl.classList.add('hidden');
  editorUI.classList.remove('hidden');
}

async function main() {
  // Remove loading splash as soon as JS takes over
  document.getElementById('loading-splash')?.remove();

  const app = document.getElementById('app')!;
  geometryDataEl = createGeometryDataElement();
  installTitleGuard();

  // Overlay container for landing/help pages (sits above the editor UI)
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'overlay-container';
  overlayContainer.className = 'flex flex-col flex-1 min-h-0 w-full hidden';

  // Wrapper for the main editor UI (toolbar + session bar + layout)
  const editorUI = document.createElement('div');
  editorUI.id = 'editor-ui';
  editorUI.className = 'flex flex-col flex-1 min-h-0 w-full';

  let landingEl: HTMLElement | null = null;
  let helpEl: HTMLElement | null = null;

  // Load examples (JS + SCAD) with language metadata
  const examples: Record<string, ExampleEntry> = {};
  for (const [path, loader] of Object.entries(jsExampleModules)) {
    examples[path] = { code: await loader() as string, language: 'manifold-js' };
  }
  for (const [path, loader] of Object.entries(scadExampleModules)) {
    examples[path] = { code: await loader() as string, language: 'scad' };
  }

  const defaultExampleKey = Object.keys(examples).find(k => k.includes('basic_shapes')) ?? Object.keys(examples)[0];
  const defaultCode = examples[defaultExampleKey]?.code ?? '// Write your manifold code here\nconst { Manifold } = api;\nreturn Manifold.cube([5,5,5], true);';

  // Create toolbar
  createToolbar(editorUI, examples, {
    onRun: () => runCode(),
    onExportGLB: async () => {
      try { await exportGLB(); } catch (e) { console.error('GLB export error:', e); }
    },
    onExportSTL: () => {
      if (currentMeshData) exportSTL(currentMeshData);
    },
    onExportOBJ: () => {
      if (currentMeshData) exportOBJ(currentMeshData);
    },
    onExport3MF: () => {
      if (currentMeshData) export3MF(currentMeshData);
    },
    onExampleSelect: async (entry: ExampleEntry) => {
      // Auto-switch engine + editor mode if the example uses a different language.
      if (entry.language !== getActiveLanguage()) {
        await switchLanguage(entry.language);
      }
      setValue(entry.code);
      runCode(entry.code);
    },
    onLanguageSwitch: async (lang: 'manifold-js' | 'scad') => {
      if (lang === getActiveLanguage()) return;
      // If current session has work, ask before switching
      const curState = getState();
      if (curState.session && curState.versionCount > 0) {
        const msg = lang === 'scad'
          ? 'Your current JS session will be kept. Start new OpenSCAD session?'
          : 'Your current SCAD session will be kept. Start new JavaScript session?';
        const ok = await showInlineConfirm(editorUI, msg);
        if (!ok) return;
      }
      await switchLanguage(lang);
      // Create a fresh session in the new language (empty previous session auto-deleted)
      await createSession(undefined, lang);
      const defaultScad = '// OpenSCAD\ncube([10, 10, 10], center=true);';
      const defaultJs = 'const { Manifold } = api;\nreturn Manifold.cube([10, 10, 10], true);';
      const code = lang === 'scad' ? defaultScad : defaultJs;
      setValue(code);
      runCode(code);
    },
  });

  // Create session bar
  createSessionBar(editorUI, {
    onSaveVersion: async () => ({
      code: getValue(),
      geometryData: getGeometryDataObj(),
      thumbnail: await captureThumbnail(),
    }),
    onLoadVersion: (code: string) => {
      setValue(code);
      runCode(code);
    },
    onOpenGallery: () => {
      switchTab('gallery');
      refreshGallery();
    },
    onOpenSessionList: () => showSessionList(),
    onLoadReferenceImages: (images: Record<string, string>) => {
      _setRefImages(images as ReferenceImages);
      persistReferenceImages(images as ReferenceImagesData);
      if (currentMeshData) {
        renderElevationsToContainer(
          document.getElementById('elevations-container')!,
          currentMeshData,
        );
      }
    },
    onNewSession: () => {
      const freshCode = '// New session\nconst { Manifold } = api;\nreturn Manifold.cube([10, 10, 10], true);';
      setValue(freshCode);
      runCode(freshCode);
      _clearRefImages();
    },
  });

  // Create layout
  const { editorContainer, viewportPane, viewsContainer, elevationsContainer, galleryContainer, notesContainer, statusBar, clipControls, switchTab } = createLayout(editorUI);

  // Init views panel
  initViewsPanel(viewsContainer);

  // Init gallery
  createGalleryView(galleryContainer, (code: string) => {
    setValue(code);
    runCode(code);
    switchTab('interactive');
  });

  // Init notes panel
  createNotesView(notesContainer);

  // Refresh gallery/notes whenever their tabs are selected
  window.addEventListener('tab-switched', ((e: CustomEvent) => {
    if (e.detail.tab === 'gallery') refreshGallery();
    if (e.detail.tab === 'notes') refreshNotes();
  }) as EventListener);

  // Init session list
  initSessionList(
    async (code: string) => {
      // Restore language from the newly opened session
      const sessionLang = getState().session?.language ?? 'manifold-js';
      if (sessionLang !== getActiveLanguage()) {
        await switchLanguage(sessionLang);
      }
      setValue(code);
      runCode(code);
    },
    async (code: string) => {
      await runCodeSync(code);
      return captureThumbnail();
    },
  );

  // Assemble DOM early so landing/help pages can render before WASM loads
  app.appendChild(editorUI);
  app.appendChild(overlayContainer);

  // Helper to transition from landing/help to editor
  function transitionToEditor() {
    showEditorUI(landingEl, helpEl, editorUI);
    overlayContainer.classList.add('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  // Track whether user came from landing (for help back navigation)
  let cameFromLanding = false;

  // Helper to show help page
  function showHelp() {
    cameFromLanding = landingEl != null && !landingEl.classList.contains('hidden');
    if (!helpEl) {
      helpEl = createHelpPage(overlayContainer, {
        onBack: () => {
          if (cameFromLanding && landingEl) {
            // Go back to landing
            helpEl?.classList.add('hidden');
            landingEl.classList.remove('hidden');
            window.history.replaceState(null, '', '/');
            updateDocumentTitle({ page: 'landing' });
          } else {
            // Go back to editor — preserve session URL params
            transitionToEditor();
            const state = getState();
            if (state.session) {
              const params = new URLSearchParams();
              params.set('session', state.session.id);
              if (state.currentVersion) params.set('v', String(state.currentVersion.index));
              window.history.replaceState(null, '', `/editor?${params}`);
            } else {
              window.history.replaceState(null, '', '/editor');
            }
            updateDocumentTitle({ page: 'editor' });
          }
        },
        onStartTour: async () => {
          // Always go to editor (not landing), wait for it to be ready, then start tour
          transitionToEditor();
          await ensureEditorReady();
          if (!getState().session) {
            await createSession();
            runCode(defaultCode);
          }
          window.history.replaceState(null, '', '/editor');
          resetTour();
          startTour();
        },
      });
    }
    overlayContainer.classList.remove('hidden');
    editorUI.classList.add('hidden');
    if (landingEl) landingEl.classList.add('hidden');
    helpEl.classList.remove('hidden');
    window.history.replaceState(null, '', '/help');
    updateDocumentTitle({ page: 'help' });
  }

  // Expose showHelp for toolbar
  const windowRecord = window as unknown as Record<string, unknown>;
  windowRecord.__partwrightShowHelp = showHelp;
  windowRecord.__mainifoldShowHelp = showHelp;

  // Check which page to show before loading heavy resources
  const showLanding = shouldShowLanding();
  const showHelpPage = shouldShowHelp();
  const show404 = shouldShow404();

  if (showLanding) {
    // Show landing page immediately — hide editor UI
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
    updateDocumentTitle({ page: 'landing' });
    landingEl = await createLandingPage(overlayContainer, {
      onOpenEditor: async () => {
        transitionToEditor();
        await ensureEditorReady();
        await createSession();
        updateDocumentTitle({ page: 'editor' });
        setStatus(statusBar, 'ready', 'Ready');
        runCode(defaultCode);
      },
      onOpenHelp: showHelp,
      onOpenSession: async (sid) => {
        transitionToEditor();
        await ensureEditorReady();
        const version = await openSession(sid);
        if (version) {
          // Restore session language
          const sessionLang = getState().session?.language ?? 'manifold-js';
          if (sessionLang !== getActiveLanguage()) {
            await switchLanguage(sessionLang);
          }
          setValue(version.code);
          runCode(version.code);
          const refImages = await getReferenceImagesFromSession();
          if (refImages) _setRefImages(refImages as ReferenceImages);
        }
        updateDocumentTitle({ page: 'editor' });
        window.history.replaceState(null, '', `/editor?session=${sid}`);
      },
    });
  } else if (showHelpPage) {
    // Show help page immediately
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
    updateDocumentTitle({ page: 'help' });
    helpEl = createHelpPage(overlayContainer, {
      onBack: async () => {
        helpEl?.classList.add('hidden');
        transitionToEditor();
        await ensureEditorReady();
        if (!getState().session) {
          await createSession();
          runCode(defaultCode);
        }
        updateDocumentTitle({ page: 'editor' });
      },
      onStartTour: async () => {
        helpEl?.classList.add('hidden');
        transitionToEditor();
        await ensureEditorReady();
        if (!getState().session) {
          await createSession();
          runCode(defaultCode);
        }
        window.history.replaceState(null, '', '/editor');
        resetTour();
        startTour();
      },
    });
  } else if (show404) {
    // Show 404 page — hide editor UI entirely
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
    updateDocumentTitle({ page: '404' });
    createNotFoundPage(overlayContainer, {
      onGoHome: () => {
        window.location.href = '/';
      },
    });
  }

  // Init engine, viewport, editor (in background if landing/help is showing)
  let editorReady = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let editorReadyResolve: (() => void) = () => {};
  const editorReadyPromise = new Promise<void>(resolve => { editorReadyResolve = resolve; });

  async function ensureEditorReady() {
    if (!editorReady) await editorReadyPromise;
  }

  // Init geometry engine — wrapped in try/catch so editor/viewport still init on failure
  let engineOk = false;
  setStatus(statusBar, 'loading', 'Loading WASM...');
  try {
    await initEngine();
    engineOk = true;
  } catch (e) {
    console.error('WASM engine failed to load:', e);
    setStatus(statusBar, 'error', 'WASM failed');
  }

  // Init viewport
  initViewport(viewportPane);

  // Init measure tool
  initMeasureTool(getCanvas(), getCamera(), getMeshGroup(), viewportPane);

  // Init editor — only auto-run if auto-run is enabled
  initEditor(editorContainer, defaultCode, (code: string) => {
    if (isAutoRun()) runCode(code);
  });

  // Wire up clip controls
  initClipControls(clipControls);

  // Wire up viewport overlay buttons
  initGridToggle(clipControls);
  initDimensionsToggle(clipControls);
  initMeasureToggle(clipControls);
  initOrbitLockToggle(clipControls);

  editorReady = true;
  editorReadyResolve();

  // Start guided tour on first visit (after editor fully renders)
  if (!showLanding && !showHelpPage && !show404) {
    maybeStartTour();
  }

  // If not on landing/help/404, load session or default code now
  if (!showLanding && !showHelpPage && !show404 && engineOk) {
    const sessionId = getSessionIdFromURL();
    if (sessionId) {
      const versionIndex = getVersionFromURL();
      const version = await openSession(sessionId, versionIndex ?? undefined);
      if (version) {
        // Restore session language
        const sessionLang = getState().session?.language ?? 'manifold-js';
        if (sessionLang !== getActiveLanguage()) {
          setActiveLanguage(sessionLang);
          setEditorLanguage(sessionLang);
          await ensureEngineReady(sessionLang);
        }
        setValue(version.code);
        runCode(version.code);
        const refImages = await getReferenceImagesFromSession();
        if (refImages) {
          _setRefImages(refImages as ReferenceImages);
        }
        if (isGalleryMode()) {
          switchTab('gallery');
          refreshGallery();
        }
      } else {
        await createSession();
        setStatus(statusBar, 'ready', 'Ready');
        runCode(defaultCode);
      }
    } else {
      await createSession();
      setStatus(statusBar, 'ready', 'Ready');
      runCode(defaultCode);
    }
  }

  // Update document title when session state changes (create, open, close, rename)
  onStateChange((state) => {
    updateDocumentTitle({ page: 'editor', sessionName: state.session?.name ?? null });
  });

  // Set initial editor title if we're on the editor page
  if (!showLanding && !showHelpPage && !show404) {
    updateDocumentTitle({ page: 'editor' });
  }

  // Clean up empty auto-created sessions when leaving the page
  window.addEventListener('beforeunload', () => {
    const state = getState();
    if (state.session && state.versionCount === 0) {
      deleteIfEmpty(state.session.id);
    }
  });

  // Warn AI agents that try to drive the UI when ?view=ai is set
  if (new URLSearchParams(window.location.search).get('view') === 'ai') {
    let agentUIWarningShown = false;
    const warnAgentUI = () => {
      if (agentUIWarningShown) return;
      agentUIWarningShown = true;
      const msg = 'Detected UI-driven input. This app expects programmatic control from AI agents. Use window.partwright.runAndSave() -- see /llms.txt';
      console.warn(msg);
      // Show a non-blocking toast
      const toast = document.createElement('div');
      toast.textContent = msg;
      toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#451a03;color:#fbbf24;padding:8px 16px;border-radius:6px;font-size:13px;z-index:9999;max-width:600px;text-align:center;pointer-events:none;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 8000);
    };
    // Listen on the editor and viewport containers
    editorUI.addEventListener('keydown', warnAgentUI, { once: true });
    editorUI.addEventListener('click', warnAgentUI, { once: true });
  }

  // === Language switching helper ===
  async function switchLanguage(lang: Language) {
    setActiveLanguage(lang);
    setEditorLanguage(lang);
    setToolbarLanguage(lang);
    // Update editor filename indicator
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.textContent = lang === 'scad' ? 'editor.scad' : 'editor.js';
    setStatus(statusBar, 'running', lang === 'scad' ? 'Loading OpenSCAD...' : 'Switching...');
    try {
      await ensureEngineReady(lang);
    } catch (e) {
      setStatus(statusBar, 'error', `Failed to load ${lang}: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    setStatus(statusBar, 'ready', 'Ready');
  }

  // === Execution state ===
  let _running = false;

  async function executeIsolated(code: string, lang?: Language) {
    const t0 = performance.now();
    const result = await executeCodeAsync(code, lang);
    const elapsed = Math.round(performance.now() - t0);

    if (result.error) {
      recordError(result.error);
      return {
        geometryData: { status: 'error' as const, error: result.error, executionTimeMs: elapsed, codeHash: simpleHash(code) },
        meshData: null as MeshData | null,
        manifold: null as unknown,
      };
    }

    const stats = computeGeometryStats(result.manifold, result.mesh!, elapsed, code);
    return {
      geometryData: stats,
      meshData: result.mesh,
      manifold: result.manifold,
    };
  }

  // === Expose window.partwright console API ===
  const partwrightAPI = {
    /** Run code string and update all views. Returns geometry data object. */
    async run(code?: string): Promise<Record<string, unknown>> {
      assertString(code, 'run(code)', { optional: true, allowEmpty: false });
      const src = code ?? getValue();
      if (code !== undefined) setValue(code);
      await runCodeSync(src);
      return JSON.parse(geometryDataEl.textContent || '{}');
    },

    /** Get current geometry stats without re-running */
    getGeometryData(): Record<string, unknown> {
      return JSON.parse(geometryDataEl.textContent || '{}');
    },

    /** Get current editor code */
    getCode(): string {
      return getValue();
    },

    /** Set editor code (does not auto-run — call .run() after) */
    setCode(code: string): void {
      assertString(code, 'setCode(code)', { allowEmpty: true });
      setValue(code);
    },

    /** Slice current manifold at Z height. Returns cross-section data. */
    sliceAtZ(z: number) {
      const check = guard(() => assertNumber(z, 'sliceAtZ(z)'));
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      if (!currentManifold) return { error: 'No geometry loaded' };
      return sliceAtZ(currentManifold, z);
    },

    /** Get bounding box of current geometry */
    getBoundingBox() {
      if (!currentManifold) return null;
      return getBoundingBox(currentManifold);
    },

    /** Get the raw manifold-3d module (for advanced use) */
    getModule() {
      return getModule();
    },

    /** Export current model as GLB download. Optional filename override. */
    async exportGLB(filename?: string) {
      assertString(filename, 'exportGLB(filename)', { optional: true });
      await exportGLB(filename);
    },

    /** Export current model as STL download. Optional filename override. */
    exportSTL(filename?: string) {
      assertString(filename, 'exportSTL(filename)', { optional: true });
      if (currentMeshData) exportSTL(currentMeshData, filename);
    },

    /** Export current model as OBJ download. Optional filename override. */
    exportOBJ(filename?: string) {
      assertString(filename, 'exportOBJ(filename)', { optional: true });
      if (currentMeshData) exportOBJ(currentMeshData, filename);
    },

    /** Export current model as 3MF download. Optional filename override. */
    export3MF(filename?: string) {
      assertString(filename, 'export3MF(filename)', { optional: true });
      if (currentMeshData) export3MF(currentMeshData, filename);
    },

    /** Validate code without rendering. Returns { valid, error? } */
    async validate(code: string, opts?: { language?: Language }): Promise<{ valid: boolean; error?: string }> {
      const check = guard(() => {
        assertString(code, 'validate(code)', { allowEmpty: false });
        if (opts !== undefined) {
          const o = assertObject(opts, 'validate(code, opts)')!;
          assertNoUnknownKeys(o, ['language'], 'validate(opts)');
          if (o.language !== undefined) assertEnum(o.language, ['manifold-js', 'scad'], 'validate(opts).language');
        }
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return { valid: false, error: check.error };
      const r = await validateCodeAsync(code, opts?.language);
      return r.valid ? { valid: true } : { valid: false, error: r.error };
    },

    /** Get active engine language */
    getActiveLanguage(): Language {
      return getActiveLanguage();
    },

    /** Switch active engine language. Lazy-inits SCAD on first switch. */
    async setActiveLanguage(lang: Language): Promise<void> {
      assertEnum(lang, ['manifold-js', 'scad'], 'setActiveLanguage(lang)');
      await switchLanguage(lang);
    },

    // === Clipping API ===

    /** Toggle clipping plane on/off */
    toggleClip(enabled?: boolean) {
      assertBoolean(enabled, 'toggleClip(enabled)', { optional: true });
      const on = enabled ?? !getClipState().enabled;
      setClipping(on);
      syncClipUI();
      return getClipState();
    },

    /** Set clipping plane Z height */
    setClipZ(z: number) {
      assertNumber(z, 'setClipZ(z)');
      setClipZ(z);
      syncClipUI();
      return getClipState();
    },

    /** Get current clip state */
    getClipState() {
      return getClipState();
    },

    // === View rendering API ===

    /** Render a single view from any camera angle. Returns a data URL (PNG).
     *  elevation: degrees, 0 = horizon, 90 = top-down. Default 30.
     *  azimuth: degrees, 0 = front (-Y), 90 = right (+X). Default 315.
     *  ortho: true for orthographic projection. Default false. */
    renderView(options?: { elevation?: number; azimuth?: number; ortho?: boolean; size?: number }): string | null {
      if (options !== undefined) {
        const o = assertObject(options, 'renderView(options)')!;
        assertNoUnknownKeys(o, ['elevation', 'azimuth', 'ortho', 'size'], 'renderView(options)');
        assertNumber(o.elevation, 'renderView(options).elevation', { optional: true, min: -90, max: 90 });
        assertNumber(o.azimuth, 'renderView(options).azimuth', { optional: true });
        assertBoolean(o.ortho, 'renderView(options).ortho', { optional: true });
        assertNumber(o.size, 'renderView(options).size', { optional: true, min: 1, integer: true });
      }
      if (!currentMeshData) return null;
      return renderSingleView(currentMeshData, options ?? {});
    },

    /** Render a cross-section at Z height as an SVG string for visual verification */
    sliceAtZVisual(z: number): { svg: string; area: number; contours: number } | null {
      assertNumber(z, 'sliceAtZVisual(z)');
      if (!currentManifold) return null;
      const s = sliceAtZ(currentManifold, z);
      if (!s) return null;
      const svg = renderSliceSVG(s.polygons as [number, number][][], s.boundingBox);
      return { svg, area: s.area, contours: s.polygons.length };
    },

    // === Reference image API ===

    /** Load reference images for side-by-side comparison in Elevations tab.
     *  Keys: front, right, back, left, top, perspective. Values: data URLs or image URLs.
     *  If a session is active, also persists to IndexedDB. */
    setReferenceImages(images: ReferenceImages): void {
      const REF_KEYS = ['front', 'right', 'back', 'left', 'top', 'perspective'] as const;
      const obj = assertObject(images, 'setReferenceImages(images)')!;
      assertNoUnknownKeys(obj, REF_KEYS, 'setReferenceImages(images)');
      for (const k of REF_KEYS) {
        if (obj[k] !== undefined) assertString(obj[k], `setReferenceImages(images).${k}`, { allowEmpty: false });
      }
      _setRefImages(images);
      // Persist to session if one is active
      persistReferenceImages(images as ReferenceImagesData);
      // Re-render elevations with reference images if we have mesh data
      if (currentMeshData) {
        renderElevationsToContainer(
          document.getElementById('elevations-container')!,
          currentMeshData,
        );
      }
    },

    /** Clear all reference images */
    clearReferenceImages(): void {
      _clearRefImages();
      // Clear from session if one is active
      persistReferenceImages(null);
      if (currentMeshData) {
        renderElevationsToContainer(
          document.getElementById('elevations-container')!,
          currentMeshData,
        );
      }
    },

    /** Get currently loaded reference images (or null if none) */
    getReferenceImages(): ReferenceImages | null {
      return _getRefImages();
    },

    // === Session API ===

    /** Create a new session and make it active */
    async createSession(name?: string) {
      assertString(name, 'createSession(name)', { optional: true });
      const session = await createSession(name, getActiveLanguage());
      await addSessionNote(
        '[WORKFLOW] Drive this app via window.partwright (see /ai.md). ' +
        'Use runAndSave(code, label, assertions) for iterations; ' +
        'addSessionNote with [REQUIREMENT]/[DECISION]/[MEASUREMENT]/[FEEDBACK]/[ATTEMPT]/[TODO] prefixes; ' +
        'getSessionContext() when resuming.',
      );
      return { id: session.id, url: getSessionUrl(), galleryUrl: getGalleryUrl() };
    },

    /** List all saved sessions */
    async listSessions() {
      const sessions = await listSessions();
      return sessions.map(s => ({ id: s.id, name: s.name, updated: s.updated }));
    },

    /** Open an existing session (loads latest version, restores reference images, restores language) */
    async openSession(id: string) {
      const check = guard(() => assertString(id, 'openSession(id)', { allowEmpty: false }));
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      const version = await openSession(id);
      if (version) {
        // Restore language from session
        const lang = getState().session?.language ?? 'manifold-js';
        if (lang !== getActiveLanguage()) {
          await switchLanguage(lang);
        }
        setValue(version.code);
        await runCodeSync(version.code);
      }
      // Restore reference images from session
      const refImages = await getReferenceImagesFromSession();
      if (refImages) {
        _setRefImages(refImages as ReferenceImages);
        if (currentMeshData) {
          renderElevationsToContainer(
            document.getElementById('elevations-container')!,
            currentMeshData,
          );
        }
      } else {
        _clearRefImages();
      }
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** Close the current session */
    async closeSession() {
      await closeSession();
    },

    /** Delete a session and all its versions */
    async deleteSession(id: string) {
      assertString(id, 'deleteSession(id)', { allowEmpty: false });
      await deleteSession(id);
    },

    /** Save current state as a new version in the active session */
    async saveVersion(label?: string) {
      assertString(label, 'saveVersion(label)', { optional: true });
      const thumbnail = await captureThumbnail();
      const version = await saveVersion(getValue(), getGeometryDataObj(), thumbnail, label);
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** List all versions in the current session */
    async listVersions() {
      const versions = await listCurrentVersions();
      return versions.map(v => ({
        id: v.id,
        index: v.index,
        label: v.label,
        timestamp: v.timestamp,
        status: (v.geometryData as Record<string, unknown> | null)?.status ?? null,
      }));
    },

    /** Load a version into the editor. Pass { index } or { id } from listVersions().
     *  Returns the loaded version's code and stats, or { error } if not found. */
    async loadVersion(target: { index?: number; id?: string }) {
      const parsed = parseVersionTarget(target, 'loadVersion');
      if ('error' in parsed) return parsed;
      if (!getState().session) {
        return { error: 'No active session. Call openSession(id) or createSession() first.' };
      }
      const version = await loadVersionFromStore(parsed.value);
      if (!version) {
        const kind = parsed.kind;
        return { error: `No version found with ${kind} "${parsed.value}" in the active session. Use listVersions() to see valid ${kind}s.` };
      }
      setValue(version.code);
      await runCodeSync(version.code);
      return {
        id: version.id,
        index: version.index,
        label: version.label,
        code: version.code,
        geometryData: version.geometryData,
      };
    },

    /** Navigate to previous or next version */
    async navigateVersion(direction: 'prev' | 'next') {
      const check = guard(() => assertEnum(direction, ['prev', 'next'] as const, 'navigateVersion(direction)'));
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      const version = await navigateVersion(direction);
      if (version) {
        setValue(version.code);
        await runCodeSync(version.code);
      }
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** Run code and save as a new version in one call. Returns stat diff vs previous version.
     *  Optional assertions — if provided, validates before saving. Fails fast without saving if assertions don't pass. */
    async runAndSave(code: string, label?: string, assertions?: GeometryAssertions) {
      const check = guard(() => {
        assertString(code, 'runAndSave(code)', { allowEmpty: false });
        assertString(label, 'runAndSave(label)', { optional: true });
        if (assertions !== undefined) validateAssertionsShape(assertions, 'runAndSave(assertions)');
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      // If assertions provided, validate in isolation first (no side effects if it fails)
      if (assertions) {
        const { geometryData: testData, manifold: testManifold } = await executeIsolated(code);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { (testManifold as any)?.delete?.(); } catch { /* ignore */ }
        if (testData.status === 'error') {
          return { passed: false, failures: [testData.error as string], geometry: testData, version: null, diff: null, galleryUrl: getGalleryUrl() };
        }
        const failures = checkAssertions(testData, assertions);
        if (failures.length > 0) {
          return { passed: false, failures, geometry: testData, version: null, diff: null, galleryUrl: getGalleryUrl() };
        }
      }

      // Auto-create session if none exists (e.g. AI agent calling runAndSave without createSession)
      if (!getState().session) {
        const sessionName = label || `AI Session ${new Date().toLocaleDateString()}`;
        await createSession(sessionName, getActiveLanguage());
      }

      const prevGeoData = getState().currentVersion?.geometryData as Record<string, unknown> | null;

      setValue(code);
      await runCodeSync(code);
      const newGeoData = JSON.parse(geometryDataEl.textContent || '{}');
      const thumbnail = await captureThumbnail();
      const version = await saveVersion(code, getGeometryDataObj(), thumbnail, label, assertions?.notes);

      let diff = null;
      if (prevGeoData && prevGeoData.status === 'ok' && newGeoData.status === 'ok') {
        diff = computeStatDiff(prevGeoData, newGeoData);
      }

      return {
        ...(assertions ? { passed: true } : {}),
        geometry: newGeoData,
        version: version ? { id: version.id, index: version.index, label: version.label } : null,
        diff,
        galleryUrl: getGalleryUrl(),
      };
    },

    /** Fork a prior version: load its code, apply transformFn, validate, and save as a new version.
     *  target: { index } or { id } from listVersions().
     *  transformFn: (code: string) => string — modifies the parent's code. Return the full new code.
     *  Eliminates the load + getCode + modify + save round-trip chain.
     *  Returns { error } if the parent isn't found or transformFn throws.
     *  Returns { passed, failures } without saving if assertions fail.
     *  On success: { passed?, parent, geometry, version, diff, galleryUrl }. */
    async forkVersion(
      target: { index?: number; id?: string },
      transformFn: (code: string) => string,
      label?: string,
      assertions?: GeometryAssertions,
    ) {
      const parsed = parseVersionTarget(target, 'forkVersion');
      if ('error' in parsed) return parsed;
      if (typeof transformFn !== 'function') {
        return { error: 'forkVersion(target, transformFn): transformFn must be a function (code: string) => string. See /ai.md#argument-validation' };
      }
      const check = guard(() => {
        assertString(label, 'forkVersion(label)', { optional: true });
        if (assertions !== undefined) validateAssertionsShape(assertions, 'forkVersion(assertions)');
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      if (!getState().session) {
        return { error: 'No active session. Call openSession(id) or createSession() first.' };
      }

      const parent = await peekVersion(parsed.value);
      if (!parent) {
        const kind = typeof target === 'number' ? 'index' : 'id';
        return { error: `No version found with ${kind} "${target}" in the active session. Use listVersions() to see valid ${kind}s.` };
      }

      let newCode: string;
      try {
        newCode = transformFn(parent.code);
      } catch (e: unknown) {
        return { error: `transformFn threw: ${e instanceof Error ? e.message : String(e)}`, parent: { id: parent.id, index: parent.index, label: parent.label } };
      }
      if (typeof newCode !== 'string') {
        return { error: `transformFn must return a string; got ${typeof newCode}`, parent: { id: parent.id, index: parent.index, label: parent.label } };
      }

      // Validate in isolation before committing anything.
      const { geometryData: testData, manifold: testManifold } = await executeIsolated(newCode);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (testManifold as any)?.delete?.(); } catch { /* ignore */ }
      if (testData.status === 'error') {
        return { passed: false, failures: [testData.error as string], geometry: testData, parent: { id: parent.id, index: parent.index, label: parent.label }, version: null, diff: null, galleryUrl: getGalleryUrl() };
      }
      if (assertions) {
        const failures = checkAssertions(testData, assertions);
        if (failures.length > 0) {
          return { passed: false, failures, geometry: testData, parent: { id: parent.id, index: parent.index, label: parent.label }, version: null, diff: null, galleryUrl: getGalleryUrl() };
        }
      }

      // Commit: update editor, run, save.
      const prevGeoData = getState().currentVersion?.geometryData as Record<string, unknown> | null;
      setValue(newCode);
      await runCodeSync(newCode);
      const newGeoData = JSON.parse(geometryDataEl.textContent || '{}');
      const thumbnail = await captureThumbnail();
      const version = await saveVersion(newCode, getGeometryDataObj(), thumbnail, label, assertions?.notes);

      let diff = null;
      if (prevGeoData && prevGeoData.status === 'ok' && newGeoData.status === 'ok') {
        diff = computeStatDiff(prevGeoData, newGeoData);
      }

      return {
        ...(assertions ? { passed: true } : {}),
        parent: { id: parent.id, index: parent.index, label: parent.label },
        geometry: newGeoData,
        version: version ? { id: version.id, index: version.index, label: version.label } : null,
        diff,
        galleryUrl: getGalleryUrl(),
      };
    },

    /** Get URL for the current session */
    getSessionUrl() {
      return getSessionUrl();
    },

    /** Get URL for the gallery view of the current session */
    getGalleryUrl() {
      return getGalleryUrl();
    },

    /** Get current session state */
    getSessionState() {
      const state = getState();
      return {
        session: state.session ? { id: state.session.id, name: state.session.name } : null,
        currentVersion: state.currentVersion ? { index: state.currentVersion.index, label: state.currentVersion.label } : null,
        versionCount: state.versionCount,
      };
    },

    /** Add a standalone note to the current session (requirements, feedback, decisions) */
    async addSessionNote(text: string) {
      const check = guard(() => assertString(text, 'addSessionNote(text)', { allowEmpty: false }));
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      const note = await addSessionNote(text);
      if (!note) return { error: 'No active session' };
      return { id: note.id, text: note.text, timestamp: note.timestamp };
    },

    /** List all notes in the current session */
    async listSessionNotes() {
      const notes = await listSessionNotes();
      return notes.map(n => ({ id: n.id, text: n.text, timestamp: n.timestamp }));
    },

    /** Delete a session note by ID */
    async deleteSessionNote(noteId: string) {
      const check = guard(() => assertString(noteId, 'deleteSessionNote(noteId)', { allowEmpty: false }));
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      await deleteSessionNote(noteId);
      return { success: true };
    },

    /** Update a session note's text by ID */
    async updateSessionNote(noteId: string, text: string) {
      const check = guard(() => {
        assertString(noteId, 'updateSessionNote(noteId)', { allowEmpty: false });
        assertString(text, 'updateSessionNote(text)', { allowEmpty: false });
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      await updateSessionNote(noteId, text);
      return { success: true };
    },

    /** Get full session context — everything an AI agent needs to understand this session */
    async getSessionContext() {
      const ctx = await getSessionContext();
      if (!ctx) return { error: 'No active session' };
      return ctx;
    },

    /** Export a session as JSON (defaults to current session) */
    async exportSession(sessionId?: string) {
      assertString(sessionId, 'exportSession(sessionId)', { optional: true });
      return exportSession(sessionId);
    },

    /** Import a session from JSON data, regenerating thumbnails */
    async importSession(data: ExportedSession) {
      const check = guard(() => {
        const d = assertObject(data, 'importSession(data)')!;
        const brandVersion = d.partwright ?? d.mainifold;
        assertString(brandVersion, 'importSession(data).partwright', { allowEmpty: false });
        const s = assertObject(d.session, 'importSession(data).session')!;
        assertString(s.name, 'importSession(data).session.name', { allowEmpty: true });
        assertNumber(s.created, 'importSession(data).session.created');
        assertNumber(s.updated, 'importSession(data).session.updated');
        const versions = assertArray(d.versions, 'importSession(data).versions');
        for (let i = 0; i < versions.length; i++) {
          const v = assertObject(versions[i], `importSession(data).versions[${i}]`)!;
          assertNumber(v.index, `importSession(data).versions[${i}].index`, { integer: true });
          assertString(v.code, `importSession(data).versions[${i}].code`, { allowEmpty: true });
          assertString(v.label, `importSession(data).versions[${i}].label`, { allowEmpty: true });
          assertNumber(v.timestamp, `importSession(data).versions[${i}].timestamp`);
          if (v.notes !== undefined) assertString(v.notes, `importSession(data).versions[${i}].notes`, { allowEmpty: true });
          // geometryData may be null or an object; don't over-specify shape (historical data varies)
          if (v.geometryData !== null && v.geometryData !== undefined) {
            assertObject(v.geometryData, `importSession(data).versions[${i}].geometryData`);
          }
        }
        if (d.notes !== undefined) {
          const notes = assertArray(d.notes, 'importSession(data).notes');
          for (let i = 0; i < notes.length; i++) {
            const n = assertObject(notes[i], `importSession(data).notes[${i}]`)!;
            assertString(n.text, `importSession(data).notes[${i}].text`, { allowEmpty: true });
            assertNumber(n.timestamp, `importSession(data).notes[${i}].timestamp`);
          }
        }
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      const session = await importSession(data, async (code: string) => {
        await runCodeSync(code);
        return captureThumbnail();
      });
      const version = await openSession(session.id);
      if (version) {
        setValue(version.code);
        await runCodeSync(version.code);
      }
      // Restore reference images from imported session
      const refImages = await getReferenceImagesFromSession();
      if (refImages) {
        _setRefImages(refImages as ReferenceImages);
        if (currentMeshData) {
          renderElevationsToContainer(
            document.getElementById('elevations-container')!,
            currentMeshData,
          );
        }
      }
      return { id: session.id, name: session.name };
    },

    /** Clear all sessions and versions from IndexedDB */
    async clearAllSessions() {
      await clearAllSessions();
    },

    // === Isolated execution & assertions ===

    /** Check if geometry code is currently executing */
    isRunning(): boolean {
      return _running;
    },

    /** Run code without mutating editor, viewport, or session state. Returns geometry stats + thumbnail. */
    async runIsolated(code: string) {
      const check = guard(() => assertString(code, 'runIsolated(code)', { allowEmpty: false }));
      if (typeof check === 'object' && check !== null && 'error' in check) {
        return { geometryData: { status: 'error', error: check.error }, thumbnail: null };
      }
      const { geometryData, meshData, manifold } = await executeIsolated(code);

      let thumbnail: string | null = null;
      if (meshData) {
        try {
          const canvas = renderCompositeCanvas(meshData);
          thumbnail = canvas.toDataURL('image/png');
        } catch { /* ignore */ }
      }

      // Clean up manifold to prevent memory leaks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (manifold as any)?.delete?.(); } catch { /* ignore */ }

      return { geometryData, thumbnail };
    },

    /** Run code and check geometry against assertions. Does not mutate global state. */
    async runAndAssert(code: string, assertions: GeometryAssertions) {
      const check = guard(() => {
        assertString(code, 'runAndAssert(code)', { allowEmpty: false });
        validateAssertionsShape(assertions, 'runAndAssert(assertions)');
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) {
        return { passed: false, failures: [check.error], stats: null };
      }
      const { geometryData, manifold } = await executeIsolated(code);

      // Clean up manifold
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (manifold as any)?.delete?.(); } catch { /* ignore */ }

      if (geometryData.status === 'error') {
        return { passed: false, failures: [geometryData.error as string], stats: geometryData };
      }

      const failures = checkAssertions(geometryData, assertions);
      return {
        passed: failures.length === 0,
        failures: failures.length > 0 ? failures : undefined,
        stats: geometryData,
      };
    },

    /** Run code and decompose result into individual components for debugging. Does not mutate global state. */
    async runAndExplain(code: string) {
      const check = guard(() => assertString(code, 'runAndExplain(code)', { allowEmpty: false }));
      if (typeof check === 'object' && check !== null && 'error' in check) {
        return { stats: { status: 'error', error: check.error }, components: null };
      }
      const { geometryData, manifold } = await executeIsolated(code);

      if (geometryData.status === 'error' || !manifold) {
        return { stats: geometryData, components: null };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = manifold as any;
      let components: { index: number; volume: number; surfaceArea: number; centroid: number[]; boundingBox: { min: number[]; max: number[] } }[] | null = null;

      try {
        const parts = m.decompose();
        if (parts.length > 1) {
          components = parts.map((p: any, i: number) => {
            const bb = getBoundingBox(p);
            const vol = (() => { try { return p.volume(); } catch { return 0; } })();
            const sa = (() => { try { return p.surfaceArea(); } catch { return 0; } })();
            const centroid = bb
              ? [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]
              : [0, 0, 0];
            p.delete();
            return { index: i, volume: Math.round(vol * 100) / 100, surfaceArea: Math.round(sa * 100) / 100, centroid: centroid.map((c: number) => Math.round(c * 10) / 10), boundingBox: bb ?? { min: [0, 0, 0], max: [0, 0, 0] } };
          });
        } else {
          for (const p of parts) p.delete();
        }
      } catch { /* ignore */ }

      // Containment/occlusion check (before cleanup — needs manifold alive)
      let containmentWarnings: ContainmentWarning[] = [];
      try { containmentWarnings = checkContainment(m); } catch { /* ignore */ }

      // Clean up
      try { m.delete?.(); } catch { /* ignore */ }

      // Generate hints
      const hints: string[] = [];
      if (components && components.length > 1) {
        const sorted = [...components].sort((a, b) => b.volume - a.volume);
        const mainBody = sorted[0];
        const mainVol = mainBody.volume;
        const floaters = sorted.filter(c => c.volume < mainVol * 0.01);
        const mediumParts = sorted.filter(c => c.volume >= mainVol * 0.01 && c !== mainBody);

        // Identify main body
        hints.push(`Main body: component ${mainBody.index} (volume: ${mainBody.volume}, centroid: [${mainBody.centroid}])`);

        if (floaters.length > 0) {
          hints.push(`${floaters.length} tiny disconnected component(s) detected — likely floating attachments that failed to union:`);
          for (const f of floaters) {
            // Suggest fix: find which face of main body is closest to the floater
            const fc = f.centroid;
            const mb = mainBody.boundingBox;
            const axes = ['X', 'Y', 'Z'];
            let closestAxis = '';
            let closestDist = Infinity;
            let closestDir = '';
            for (let ax = 0; ax < 3; ax++) {
              const distToMin = Math.abs(fc[ax] - mb.min[ax]);
              const distToMax = Math.abs(fc[ax] - mb.max[ax]);
              if (distToMin < closestDist) { closestDist = distToMin; closestAxis = axes[ax]; closestDir = 'min'; }
              if (distToMax < closestDist) { closestDist = distToMax; closestAxis = axes[ax]; closestDir = 'max'; }
            }
            const suggestion = closestDist <= 1.0
              ? ` — sits on ${closestDir} ${closestAxis}-face of main body. Try .translate() to overlap by 0.5 units along ${closestAxis}.`
              : ` — ${closestDist.toFixed(1)} units from main body. May need repositioning.`;
            hints.push(`  Component ${f.index}: volume ${f.volume}, centroid [${f.centroid}]${suggestion}`);
          }
        }
        if (mediumParts.length > 0) {
          hints.push(`${mediumParts.length + 1} components of similar size — major geometry sections are not connected`);
        }

        // Check for near-touching bounding boxes (flush placement)
        const TOUCH_TOL = 1.0;
        for (let i = 0; i < components.length; i++) {
          for (let j = i + 1; j < components.length; j++) {
            const a = components[i].boundingBox;
            const b = components[j].boundingBox;
            // Check if bounding boxes are within tolerance on any axis
            // (close enough to suggest they were meant to be joined)
            const gaps = [0, 1, 2].map(ax => {
              const gap = Math.max(a.min[ax] - b.max[ax], b.min[ax] - a.max[ax]);
              return gap; // negative = overlapping, 0 = flush, positive = gap
            });
            const minGap = Math.min(...gaps);
            const maxGap = Math.max(...gaps);
            // If boxes overlap on 2 axes and are flush/near-flush on the third
            if (minGap <= 0 && maxGap >= -0.01 && maxGap <= TOUCH_TOL) {
              hints.push(`Components ${i} and ${j} share a face or near-touch (gap: ${maxGap.toFixed(2)}) — they likely need volumetric overlap (offset by 0.5+ units) to union correctly`);
            }
          }
        }
      }

      // Add containment warnings to hints
      if (containmentWarnings.length > 0) {
        hints.push(`WARNING: ${containmentWarnings.length} contained component(s) detected (geometrically invisible):`);
        for (const w of containmentWarnings) {
          hints.push(`  ${w.message}`);
        }
      }

      return { stats: geometryData, components, hints: hints.length > 0 ? hints : undefined, containmentWarnings: containmentWarnings.length > 0 ? containmentWarnings : undefined };
    },

    /** Modify current editor code with a transform function and test the result without committing.
     *  The patchFn receives the current code string and returns modified code.
     *  Runs in isolation — no side effects on editor/viewport/session. */
    async modifyAndTest(patchFn: (code: string) => string, assertions?: GeometryAssertions) {
      const check = guard(() => {
        assertFunction(patchFn, 'modifyAndTest(patchFn)');
        if (assertions !== undefined) validateAssertionsShape(assertions, 'modifyAndTest(assertions)');
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) {
        return { error: check.error, modifiedCode: null, stats: null };
      }
      const currentCode = getValue();
      let modifiedCode: string;
      try {
        modifiedCode = patchFn(currentCode);
      } catch (e: unknown) {
        return { error: `Patch function failed: ${e instanceof Error ? e.message : String(e)}`, modifiedCode: null, stats: null };
      }

      const { geometryData, manifold } = await executeIsolated(modifiedCode);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (manifold as any)?.delete?.(); } catch { /* ignore */ }

      if (geometryData.status === 'error') {
        return { error: geometryData.error, modifiedCode, stats: geometryData, ...(assertions ? { passed: false, failures: [geometryData.error as string] } : {}) };
      }

      if (assertions) {
        const failures = checkAssertions(geometryData, assertions);
        return { modifiedCode, stats: geometryData, passed: failures.length === 0, failures: failures.length > 0 ? failures : undefined };
      }

      return { modifiedCode, stats: geometryData };
    },

    /** Query multiple properties of the current geometry in a single call. Avoids multiple round-trips. */
    query(opts: { sliceAt?: number[]; decompose?: boolean; boundingBox?: boolean }) {
      const check = guard(() => {
        const o = assertObject(opts, 'query(opts)')!;
        assertNoUnknownKeys(o, ['sliceAt', 'decompose', 'boundingBox'], 'query(opts)');
        if (o.sliceAt !== undefined) {
          const arr = assertArray(o.sliceAt, 'query(opts).sliceAt');
          for (let i = 0; i < arr.length; i++) {
            assertNumber(arr[i], `query(opts).sliceAt[${i}]`);
          }
        }
        assertBoolean(o.decompose, 'query(opts).decompose', { optional: true });
        assertBoolean(o.boundingBox, 'query(opts).boundingBox', { optional: true });
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;

      const result: Record<string, unknown> = {};

      if (!currentManifold) {
        return { error: 'No geometry loaded' };
      }

      if (opts.boundingBox) {
        result.boundingBox = getBoundingBox(currentManifold);
      }

      if (opts.sliceAt && opts.sliceAt.length > 0) {
        const slices: Record<string, unknown> = {};
        for (const z of opts.sliceAt) {
          const s = sliceAtZ(currentManifold, z);
          slices[`z${z}`] = s ?? { error: `No cross-section at z=${z}` };
        }
        result.slices = slices;
      }

      if (opts.decompose) {
        try {
          const parts = currentManifold.decompose();
          result.components = parts.map((p: any, i: number) => {
            const bb = getBoundingBox(p);
            const vol = (() => { try { return p.volume(); } catch { return 0; } })();
            const sa = (() => { try { return p.surfaceArea(); } catch { return 0; } })();
            const centroid = bb
              ? [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]
              : [0, 0, 0];
            p.delete();
            return { index: i, volume: Math.round(vol * 100) / 100, surfaceArea: Math.round(sa * 100) / 100, centroid, boundingBox: bb ?? { min: [0, 0, 0], max: [0, 0, 0] } };
          });
        } catch { /* ignore */ }
      }

      // Include current stats for convenience
      result.stats = JSON.parse(geometryDataEl.textContent || '{}');

      return result;
    },

    /** Create a session and populate it with multiple versions in one call */
    async createSessionWithVersions(name: string, versions: { code: string; label?: string }[]) {
      const check = guard(() => {
        assertString(name, 'createSessionWithVersions(name)', { allowEmpty: false });
        const arr = assertArray(versions, 'createSessionWithVersions(versions)');
        if (arr.length === 0) {
          throw new ValidationError('createSessionWithVersions(versions): must contain at least one version. See /ai.md#argument-validation');
        }
        for (let i = 0; i < arr.length; i++) {
          const v = assertObject(arr[i], `createSessionWithVersions(versions[${i}])`)!;
          assertNoUnknownKeys(v, ['code', 'label'], `createSessionWithVersions(versions[${i}])`);
          assertString(v.code, `createSessionWithVersions(versions[${i}].code)`, { allowEmpty: false });
          assertString(v.label, `createSessionWithVersions(versions[${i}].label)`, { optional: true });
        }
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) return check;
      const session = await createSession(name, getActiveLanguage());
      const results = [];

      for (const v of versions) {
        setValue(v.code);
        await runCodeSync(v.code);
        const thumbnail = await captureThumbnail();
        const geoData = getGeometryDataObj();
        const version = await saveVersion(v.code, geoData, thumbnail, v.label);
        results.push({
          version: version ? { id: version.id, index: version.index, label: version.label } : null,
          geometry: geoData,
        });
      }

      return {
        session: { id: session.id, name: session.name },
        versions: results,
        galleryUrl: getGalleryUrl(),
      };
    },

    // === Phase 1: Geometry Intelligence ===

    /** Analyze Z-profile of current geometry — returns features at each height with radii, areas, positions */
    analyzeProfile(sampleCount?: number): ZProfile | null {
      assertNumber(sampleCount, 'analyzeProfile(sampleCount)', { optional: true, min: 1, integer: true });
      if (!currentManifold) return null;
      const bbox = getBoundingBox(currentManifold);
      if (!bbox) return null;
      return analyzeZProfile(currentManifold, bbox, sampleCount);
    },

    /** Analyze Z-profile of code in isolation — no side effects */
    async analyzeProfileIsolated(code: string, sampleCount?: number): Promise<{ profile: ZProfile | null; stats: Record<string, unknown> }> {
      assertString(code, 'analyzeProfileIsolated(code)', { allowEmpty: false });
      assertNumber(sampleCount, 'analyzeProfileIsolated(sampleCount)', { optional: true, min: 1, integer: true });
      const { geometryData, manifold } = await executeIsolated(code);
      if (geometryData.status === 'error' || !manifold) {
        return { profile: null, stats: geometryData };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = manifold as any;
      const bbox = getBoundingBox(m);
      const profile = bbox ? analyzeZProfile(m, bbox, sampleCount) : null;
      try { m.delete?.(); } catch { /* ignore */ }
      return { profile, stats: geometryData };
    },

    /** Probe geometry at an XY coordinate — shoots ray down Z axis, returns all hit Z values */
    measureAt(xy: [number, number]): ProbeResult | null {
      assertNumberTuple(xy, 2, 'measureAt(xy)');
      if (!currentMeshData) return null;
      return probeAtXY(currentMeshData, xy[0], xy[1]);
    },

    /** Euclidean distance between two 3D points */
    measureBetween(p1: [number, number, number], p2: [number, number, number]): number {
      assertNumberTuple(p1, 3, 'measureBetween(p1)');
      assertNumberTuple(p2, 3, 'measureBetween(p2)');
      return measureDistance(p1, p2);
    },

    /** General ray query — cast from origin in direction, return all hits */
    probeRay(origin: [number, number, number], direction: [number, number, number]): GeneralRayResult | null {
      assertNumberTuple(origin, 3, 'probeRay(origin)');
      assertNumberTuple(direction, 3, 'probeRay(direction)');
      if (!currentMeshData) return null;
      return probeRay(currentMeshData, origin, direction);
    },

    /** Check if any component is fully contained inside another (invisible geometry) */
    checkContainment(): ContainmentWarning[] | null {
      if (!currentManifold) return null;
      return checkContainment(currentManifold);
    },

    // === Phase 2: View State & Session Rename ===

    /** Get current view state — active tab, camera angle, zoom */
    getViewState(): { tab: string; camera: { azimuth: number; elevation: number; distance: number; target: [number, number, number] } } {
      const params = new URLSearchParams(window.location.search);
      let tab = 'interactive';
      if (params.has('gallery')) tab = 'gallery';
      else if (params.has('notes')) tab = 'notes';
      else if (params.get('view') === 'ai') tab = 'ai';
      else if (params.get('view') === 'elevations') tab = 'elevations';
      return { tab, camera: getCameraState() };
    },

    /** Programmatic tab switching */
    setView(tab: 'interactive' | 'ai' | 'elevations' | 'gallery' | 'notes'): void {
      assertEnum(tab, ['interactive', 'ai', 'elevations', 'gallery', 'notes'] as const, 'setView(tab)');
      switchTab(tab);
    },

    /** Rename a session */
    async renameSession(newName: string, id?: string): Promise<void> {
      assertString(newName, 'renameSession(newName)', { allowEmpty: false });
      assertString(id, 'renameSession(id)', { optional: true, allowEmpty: false });
      const targetId = id ?? getState().session?.id;
      if (!targetId) throw new Error('No active session and no id provided');
      await renameSession(targetId, newName);
    },

    // === Phase 3: Reference/Phantom Geometry ===

    /** Set translucent reference geometry for fitment checking. Code is executed in isolation (always manifold-js). */
    setReferenceGeometry(code: string, options?: PhantomOptions): { success: boolean; error?: string; boundingBox?: unknown; volume?: number } {
      const check = guard(() => {
        assertString(code, 'setReferenceGeometry(code)', { allowEmpty: false });
        if (options !== undefined) {
          const opts = assertObject(options, 'setReferenceGeometry(code, options)')!;
          assertNoUnknownKeys(opts, ['color', 'opacity', 'wireframe'], 'setReferenceGeometry(options)');
          assertNumber(opts.color, 'setReferenceGeometry(options).color', { optional: true, min: 0, max: 0xffffff, integer: true });
          assertNumber(opts.opacity, 'setReferenceGeometry(options).opacity', { optional: true, min: 0, max: 1 });
          assertBoolean(opts.wireframe, 'setReferenceGeometry(options).wireframe', { optional: true });
        }
        return true;
      });
      if (typeof check === 'object' && check !== null && 'error' in check) {
        return { success: false, error: check.error };
      }
      const result = executeCode(code, 'manifold-js');
      if (result.error) {
        return { success: false, error: result.error };
      }
      if (!result.mesh) {
        return { success: false, error: 'Code did not produce geometry' };
      }

      setPhantom(result.mesh, options);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = result.manifold as any;
      let volume = 0;
      let bb = null;
      try { volume = m.volume(); } catch { /* ignore */ }
      try { bb = getBoundingBox(m); } catch { /* ignore */ }
      try { m.delete?.(); } catch { /* ignore */ }

      return { success: true, boundingBox: bb, volume };
    },

    /** Clear phantom/reference geometry overlay */
    clearReferenceGeometry(): void {
      clearPhantom();
    },

    /** Check if phantom/reference geometry is currently displayed */
    hasReferenceGeometry(): boolean {
      return hasPhantom();
    },

    // === Phase 4: Units & Scale ===

    /** Declare the unit system (metadata only — no coordinate transformation) */
    setUnits(unit: UnitSystem): void {
      assertEnum(unit, ['mm', 'cm', 'in', 'unitless'] as const, 'setUnits(unit)');
      _setUnits(unit);
    },

    /** Get current unit system */
    getUnits(): UnitSystem {
      return _getUnits();
    },

    // === Phase 5: Measuring Tool ===

    /** Toggle interactive measure mode — click two points to measure distance.
     *  Also locks camera rotation while measuring. */
    measureMode(enabled?: boolean): void {
      assertBoolean(enabled, 'measureMode(enabled)', { optional: true });
      const state = getMeasureState();
      if (enabled === undefined) {
        // Toggle
        if (state.active) { deactivateMeasure(); setMeasureLock(false); }
        else { activateMeasure(); setMeasureLock(true); }
      } else if (enabled) {
        activateMeasure();
        setMeasureLock(true);
      } else {
        deactivateMeasure();
        setMeasureLock(false);
      }
    },

    /** Get current measurement state */
    getMeasurement(): { active: boolean; point1: [number, number, number] | null; point2: [number, number, number] | null; distance: number | null } {
      return getMeasureState();
    },

    /** Programmatic measurement between two 3D points (no clicking needed) */
    measurePoints(p1: [number, number, number], p2: [number, number, number]): number {
      assertNumberTuple(p1, 3, 'measurePoints(p1)');
      assertNumberTuple(p2, 3, 'measurePoints(p2)');
      return measureDistance(p1, p2);
    },

    /** Self-documenting help -- returns structured object and logs readable summary */
    help(method?: string): Record<string, unknown> {
      assertString(method, 'help(method)', { optional: true, allowEmpty: false });
      const methods: Record<string, { signature: string; docs: string }> = {
        // Core
        'run':             { signature: 'run(code?) -- Run code, update views, return geometry stats', docs: '/ai.md#console-api--windowpartwright' },
        'getGeometryData': { signature: 'getGeometryData() -- Current stats as JSON object', docs: '/ai.md#geometry-data' },
        'validate':        { signature: 'validate(code) -- Check code without rendering -> {valid, error?}', docs: '/ai.md#console-api--windowpartwright' },
        'getCode':         { signature: 'getCode() -- Read editor contents', docs: '/ai.md#console-api--windowpartwright' },
        'setCode':         { signature: 'setCode(code) -- Set editor contents (no auto-run)', docs: '/ai.md#console-api--windowpartwright' },
        // Isolated execution
        'runIsolated':     { signature: 'await runIsolated(code) -- Test without side effects -> {geometryData, thumbnail}', docs: '/ai.md#testing-without-side-effects' },
        'runAndAssert':    { signature: 'await runAndAssert(code, assertions) -- Validate geometry -> {passed, failures?, stats}', docs: '/ai.md#assertions----structured-validation' },
        'runAndExplain':   { signature: 'await runAndExplain(code) -- Debug disconnected components -> {stats, components[], hints[]}', docs: '/ai.md#debugging-disconnected-components' },
        'modifyAndTest':   { signature: 'await modifyAndTest(patchFn, assertions?) -- Modify + test without committing', docs: '/ai.md#modify-and-test' },
        'query':           { signature: 'query({sliceAt?, decompose?, boundingBox?}) -- Multi-query current geometry', docs: '/ai.md#multi-query-current-geometry' },
        // Sessions
        'createSession':   { signature: 'await createSession(name?) -- Create session -> {id, url, galleryUrl}', docs: '/ai.md#console-api--windowpartwright' },
        'runAndSave':      { signature: 'await runAndSave(code, label?, assertions?) -- Assert + save version in one call', docs: '/ai.md#assert--save-in-one-call' },
        'saveVersion':     { signature: 'await saveVersion(label?) -- Save current state as version', docs: '/ai.md#console-api--windowpartwright' },
        'listVersions':    { signature: 'await listVersions() -- List all versions in session', docs: '/ai.md#console-api--windowpartwright' },
        'loadVersion':     { signature: 'await loadVersion({index} | {id}) -- Load version into editor -> {id, index, label, code, geometryData} or {error}', docs: '/ai.md#console-api--windowpartwright' },
        'forkVersion':     { signature: 'await forkVersion({index} | {id}, transformFn, label?, assertions?) -- Load + modify + validate + save in one call', docs: '/ai.md#forking-a-prior-version' },
        'openSession':     { signature: 'await openSession(id) -- Open existing session', docs: '/ai.md#resuming-a-session' },
        'listSessions':    { signature: 'await listSessions() -- List all sessions', docs: '/ai.md#console-api--windowpartwright' },
        'getSessionContext': { signature: 'await getSessionContext() -- Get full session context (for resuming)', docs: '/ai.md#resuming-a-session' },
        'getGalleryUrl':   { signature: 'getGalleryUrl() -- URL for gallery view (human review)', docs: '/ai.md#console-api--windowpartwright' },
        // Notes
        'addSessionNote':  { signature: 'await addSessionNote(text) -- Add note with [PREFIX] tag', docs: '/ai.md#session-notes----tracking-design-context' },
        'listSessionNotes': { signature: 'await listSessionNotes() -- List all session notes', docs: '/ai.md#session-notes----tracking-design-context' },
        // Inspection
        'sliceAtZ':        { signature: 'sliceAtZ(z) -- Cross-section at height -> {polygons, svg, area}', docs: '/ai.md#console-api--windowpartwright' },
        'getBoundingBox':  { signature: 'getBoundingBox() -- -> {min, max}', docs: '/ai.md#console-api--windowpartwright' },
        'renderView':      { signature: 'renderView({elevation?, azimuth?, ortho?, size?}) -- Render from any angle -> data URL', docs: '/ai.md#visual-verification' },
        'analyzeProfile':  { signature: 'analyzeProfile(sampleCount?) -- Z-profile feature summary', docs: '/ai.md#console-api--windowpartwright' },
        'measureAt':       { signature: 'measureAt([x,y]) -- Ray-cast probe at XY -> {hits, thickness, topZ, bottomZ}', docs: '/ai.md#console-api--windowpartwright' },
        // View
        'setView':         { signature: 'setView(tab) -- Switch tab: "interactive", "ai", "elevations", "gallery"', docs: '/ai.md#view-tabs' },
        'getViewState':    { signature: 'getViewState() -- Current tab and camera state', docs: '/ai.md#view-tabs' },
        // Export
        'exportGLB':       { signature: 'await exportGLB() -- Download GLB file', docs: '/ai.md#console-api--windowpartwright' },
        'exportSTL':       { signature: 'exportSTL() -- Download STL file', docs: '/ai.md#console-api--windowpartwright' },
        'exportOBJ':       { signature: 'exportOBJ() -- Download OBJ file', docs: '/ai.md#console-api--windowpartwright' },
        'export3MF':       { signature: 'export3MF() -- Download 3MF file', docs: '/ai.md#console-api--windowpartwright' },
      };

      if (method) {
        const entry = methods[method];
        if (entry) {
          console.log(`${entry.signature}\nDocs: ${entry.docs}`);
          return { method, ...entry };
        }
        return { error: `Unknown method "${method}". Call help() for full list.` };
      }

      const result = {
        app: 'Partwright -- AI-driven parametric CAD in the browser',
        docs: '/ai.md',
        constraints: {
          codeMustReturn: 'Code must end with: return <Manifold object>;',
          noUIAutomation: 'Do not drive the app with clicks or keystrokes. Use this API.',
        },
        quickstart: [
          'partwright.help()                        // You are here',
          'await partwright.createSession("name")   // Start a named session',
          'await partwright.runAndSave(code, "v1", {isManifold: true, maxComponents: 1})',
        ],
        methods,
      };

      // Also log a readable summary to the console
      const lines = [
        'Partwright -- AI-driven parametric CAD. Full docs: /ai.md',
        '',
        'Code must end with: return <Manifold object>;',
        'Do not drive the UI with clicks/keystrokes -- use this API.',
        '',
        'Quickstart:',
        '  await partwright.createSession("name")',
        '  await partwright.runAndSave(code, "v1", {isManifold: true, maxComponents: 1})',
        '',
        'Methods:',
        ...Object.entries(methods).map(([, v]) => `  ${v.signature}`),
      ];
      console.log(lines.join('\n'));

      return result;
    },
  };

  const apiWindow = window as unknown as Record<string, unknown>;
  apiWindow.partwright = partwrightAPI;
  apiWindow.mainifold = partwrightAPI;

  // Log API availability for AI agents
  console.info('Partwright: AI agents should use window.partwright -- start with partwright.help(). window.mainifold remains as a legacy alias. See /llms.txt');

  // === Internal functions ===

  function runCode(code?: string) {
    const src = code ?? getValue();
    setStatus(statusBar, 'running', 'Running...');

    requestAnimationFrame(async () => {
      await runCodeSync(src);
    });
  }

  async function runCodeSync(src: string) {
    _running = true;
    const t0 = performance.now();
    const result = await executeCodeAsync(src);
    const elapsed = Math.round(performance.now() - t0);
    _running = false;

    if (result.error) {
      recordError(result.error);
      setStatus(statusBar, 'error', result.error);
      geometryDataEl.textContent = JSON.stringify({ status: 'error', error: result.error, executionTimeMs: elapsed, codeHash: simpleHash(src) });
      return;
    }

    if (result.mesh) {
      currentMeshData = result.mesh;
      currentManifold = result.manifold;
      updateMesh(result.mesh);
      updateMultiView(result.mesh);
      renderElevationsToContainer(elevationsContainer, result.mesh);
      updateGeometryData(elapsed, src);
      syncClipSliderBounds();
      setStatus(statusBar, 'ready', 'Ready');
    }
  }

  function initClipControls(container: HTMLElement) {
    const toggleBtn = container.querySelector('#clip-toggle') as HTMLButtonElement;
    const slider = container.querySelector('#clip-z-slider') as HTMLInputElement;
    const zLabel = container.querySelector('#clip-z-label') as HTMLElement;

    toggleBtn.addEventListener('click', () => {
      const state = getClipState();
      setClipping(!state.enabled);
      syncClipUI();
    });

    slider.addEventListener('input', () => {
      const z = parseFloat(slider.value);
      setClipZ(z);
      zLabel.textContent = `Z: ${z.toFixed(2)}`;
    });
  }

  function syncClipUI() {
    const state = getClipState();
    const toggleBtn = document.getElementById('clip-toggle');
    const sliderGroup = document.getElementById('clip-slider-group');
    const slider = document.getElementById('clip-z-slider') as HTMLInputElement;
    const zLabel = document.getElementById('clip-z-label');

    if (toggleBtn) {
      toggleBtn.className = state.enabled
        ? 'px-2 py-1 rounded text-xs bg-red-500/20 backdrop-blur text-red-300 hover:bg-red-500/30 transition-colors border border-red-500/50'
        : 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
    }

    if (sliderGroup) {
      sliderGroup.classList.toggle('hidden', !state.enabled);
    }

    if (slider && state.enabled) {
      slider.value = String(state.z);
    }

    if (zLabel && state.enabled) {
      zLabel.textContent = `Z: ${state.z.toFixed(2)}`;
    }
  }

  function syncClipSliderBounds() {
    const state = getClipState();
    const slider = document.getElementById('clip-z-slider') as HTMLInputElement;
    if (!slider) return;

    slider.min = String(state.min);
    slider.max = String(state.max);
    slider.step = String((state.max - state.min) / 200);

    if (state.enabled) {
      // Keep current Z if within bounds, else reset to 75%
      if (state.z < state.min || state.z > state.max) {
        const newZ = state.min + (state.max - state.min) * 0.75;
        setClipZ(newZ);
        syncClipUI();
      }
    }
  }

  function initMeasureToggle(container: HTMLElement) {
    const measureBtn = container.querySelector('#measure-toggle') as HTMLButtonElement;
    if (!measureBtn) return;

    const inactiveClass = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
    const activeClass = 'px-2 py-1 rounded text-xs bg-blue-500/20 backdrop-blur text-blue-400 hover:bg-blue-500/30 transition-colors border border-blue-500/30';

    measureBtn.addEventListener('click', () => {
      const state = getMeasureState();
      if (state.active) {
        deactivateMeasure();
        setMeasureLock(false);
        measureBtn.className = inactiveClass;
      } else {
        activateMeasure();
        setMeasureLock(true);
        measureBtn.className = activeClass;
      }
    });
  }

  function initGridToggle(container: HTMLElement) {
    const gridBtn = container.querySelector('#grid-toggle') as HTMLButtonElement;
    if (!gridBtn) return;

    const inactiveClass = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
    const activeClass = 'px-2 py-1 rounded text-xs bg-blue-500/20 backdrop-blur text-blue-400 hover:bg-blue-500/30 transition-colors border border-blue-500/30';

    gridBtn.addEventListener('click', () => {
      const nowVisible = !isGridVisible();
      setGridVisible(nowVisible);
      gridBtn.className = nowVisible ? activeClass : inactiveClass;
      gridBtn.title = nowVisible ? 'Hide grid plane' : 'Show grid plane';
    });
  }

  function initDimensionsToggle(container: HTMLElement) {
    const dimBtn = container.querySelector('#dimensions-toggle') as HTMLButtonElement;
    if (!dimBtn) return;

    const inactiveClass = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
    const activeClass = 'px-2 py-1 rounded text-xs bg-blue-500/20 backdrop-blur text-blue-400 hover:bg-blue-500/30 transition-colors border border-blue-500/30';

    dimBtn.addEventListener('click', () => {
      const nowVisible = !isDimensionsVisible();
      setDimensionsVisible(nowVisible);
      dimBtn.className = nowVisible ? activeClass : inactiveClass;
      dimBtn.title = nowVisible ? 'Hide bounding box dimensions' : 'Show bounding box dimensions';
    });
  }

  function initOrbitLockToggle(container: HTMLElement) {
    const lockBtn = container.querySelector('#orbit-lock-toggle') as HTMLButtonElement;
    if (!lockBtn) return;

    const inactiveClass = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
    const activeClass = 'px-2 py-1 rounded text-xs bg-amber-500/20 backdrop-blur text-amber-400 hover:bg-amber-500/30 transition-colors border border-amber-500/30';

    lockBtn.addEventListener('click', () => {
      const locked = !isUserOrbitLocked();
      setUserOrbitLock(locked);
      lockBtn.className = locked ? activeClass : inactiveClass;
      lockBtn.textContent = locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
      lockBtn.title = locked ? 'Unlock camera rotation' : 'Lock camera rotation';
    });
  }
}

function setStatus(el: HTMLElement, state: 'ready' | 'running' | 'error' | 'loading', text: string) {
  el.textContent = text;
  el.className = 'text-xs font-mono max-w-xs truncate ';
  switch (state) {
    case 'ready':
      el.className += 'text-emerald-400';
      break;
    case 'running':
    case 'loading':
      el.className += 'text-amber-400';
      break;
    case 'error':
      el.className += 'text-red-400';
      break;
  }
}

/** Modal confirmation dialog with semi-transparent backdrop overlay.
 *  Returns a Promise that resolves true (Continue) or false (Cancel / Escape / click overlay). */
function showInlineConfirm(_container: HTMLElement, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Remove any existing modal
    document.querySelector('.confirm-modal-overlay')?.remove();

    // Backdrop overlay
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';

    // Modal box
    const modal = document.createElement('div');
    modal.className = 'bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-5 max-w-sm mx-4 animate-modal-in';

    const msg = document.createElement('p');
    msg.className = 'text-zinc-200 text-sm leading-relaxed mb-5';
    msg.textContent = message;

    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'px-4 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors';
    cancelBtn.textContent = 'Cancel';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors';
    continueBtn.textContent = 'Continue';

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(continueBtn);
    modal.appendChild(msg);
    modal.appendChild(btnGroup);
    overlay.appendChild(modal);

    let resolved = false;
    function finish(result: boolean) {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    continueBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));

    // Click on overlay (outside modal) dismisses
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(false);
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(false);
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    continueBtn.focus();
  });
}

main().catch(console.error);
