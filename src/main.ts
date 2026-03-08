import './style.css';
import { initEngine, executeCode, getModule } from './geometry/engine';
import { sliceAtZ, getBoundingBox } from './geometry/crossSection';
import { initViewport, updateMesh, setClipping, setClipZ, getClipState } from './renderer/viewport';
import { renderCompositeCanvas } from './renderer/multiview';
import { initEditor, setValue, getValue } from './editor/codeEditor';
import { createLayout } from './ui/layout';
import { createToolbar } from './ui/toolbar';
import { initViewsPanel, updateMultiView } from './ui/panels';
import { createSessionBar } from './ui/sessionBar';
import { createGalleryView, refreshGallery } from './ui/gallery';
import { initSessionList, showSessionList } from './ui/sessionList';
import { exportGLB } from './export/gltf';
import { exportSTL } from './export/stl';
import { exportOBJ } from './export/obj';
import { export3MF } from './export/threemf';
import type { MeshData } from './geometry/types';
import {
  getSessionIdFromURL,
  getVersionFromURL,
  isGalleryMode,
  openSession,
  createSession,
  closeSession,
  listSessions,
  deleteSession,
  saveVersion,
  navigateVersion,
  loadVersionByIndex,
  listCurrentVersions,
  getState,
  getSessionUrl,
  getGalleryUrl,
  exportSession,
  importSession,
  clearAllSessions,
  type ExportedSession,
} from './storage/sessionManager';

// Load examples as raw text
const exampleModules = import.meta.glob('../examples/*.js', { query: '?raw', import: 'default' });

let currentMeshData: MeshData | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentManifold: any = null;

// #geometry-data element — always-updated machine-readable state
let geometryDataEl: HTMLElement;

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
  try {
    const s = manifold.status();
    isManifold = s === 0 || s === 'NoError';
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
    componentCount,
    crossSections: quartileSlices,
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
  minBounds?: [number, number, number];
  maxBounds?: [number, number, number];
  minTriangles?: number;
  maxTriangles?: number;
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
  return failures;
}

function updateGeometryData(executionTimeMs?: number, sourceCode?: string) {
  if (!currentManifold || !currentMeshData) {
    geometryDataEl.textContent = JSON.stringify({ status: 'error', error: 'No geometry' });
    return;
  }

  const data = computeGeometryStats(currentManifold, currentMeshData, executionTimeMs, sourceCode);
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

async function main() {
  const app = document.getElementById('app')!;
  geometryDataEl = createGeometryDataElement();

  // Load examples
  const examples: Record<string, string> = {};
  for (const [path, loader] of Object.entries(exampleModules)) {
    examples[path] = await loader() as string;
  }

  const defaultExampleKey = Object.keys(examples).find(k => k.includes('basic_shapes')) ?? Object.keys(examples)[0];
  const defaultCode = examples[defaultExampleKey] ?? '// Write your manifold code here\nconst { Manifold } = api;\nreturn Manifold.cube([5,5,5], true);';

  // Create toolbar
  createToolbar(app, examples, {
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
    onExampleSelect: (code: string) => {
      setValue(code);
      runCode(code);
    },
  });

  // Create session bar
  createSessionBar(app, {
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
  });

  // Create layout
  const { editorContainer, viewportPane, viewsContainer, galleryContainer, statusBar, clipControls, switchTab } = createLayout(app);

  // Init views panel
  initViewsPanel(viewsContainer);

  // Init gallery
  createGalleryView(galleryContainer, (code: string) => {
    setValue(code);
    runCode(code);
    switchTab('interactive');
  });

  // Init session list
  initSessionList(
    (code: string) => {
      setValue(code);
      runCode(code);
    },
    async (code: string) => {
      runCodeSync(code);
      return captureThumbnail();
    },
  );

  // Init geometry engine
  setStatus(statusBar, 'loading', 'Loading WASM...');
  await initEngine();

  // Init viewport
  initViewport(viewportPane);

  // Init editor
  initEditor(editorContainer, defaultCode, (code: string) => {
    runCode(code);
  });

  // Wire up clip controls
  initClipControls(clipControls);

  // Load session from URL if present
  const sessionId = getSessionIdFromURL();
  if (sessionId) {
    const versionIndex = getVersionFromURL();
    const version = await openSession(sessionId, versionIndex ?? undefined);
    if (version) {
      setValue(version.code);
      runCode(version.code);
      if (isGalleryMode()) {
        switchTab('gallery');
        refreshGallery();
      }
    } else {
      setStatus(statusBar, 'ready', 'Ready');
      runCode(defaultCode);
    }
  } else {
    setStatus(statusBar, 'ready', 'Ready');
    runCode(defaultCode);
  }

  // === Execution state ===
  let _running = false;

  function executeIsolated(code: string) {
    const t0 = performance.now();
    const result = executeCode(code);
    const elapsed = Math.round(performance.now() - t0);

    if (result.error) {
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

  // === Expose window.mainifold console API ===
  const mainifoldAPI = {
    /** Run code string and update all views. Returns geometry data object. */
    run(code?: string): Record<string, unknown> {
      const src = code ?? getValue();
      if (code !== undefined) setValue(code);
      runCodeSync(src);
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
      setValue(code);
    },

    /** Slice current manifold at Z height. Returns cross-section data. */
    sliceAtZ(z: number) {
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

    /** Export current model as GLB download */
    async exportGLB() {
      await exportGLB();
    },

    /** Export current model as STL download */
    exportSTL() {
      if (currentMeshData) exportSTL(currentMeshData);
    },

    /** Export current model as OBJ download */
    exportOBJ() {
      if (currentMeshData) exportOBJ(currentMeshData);
    },

    /** Export current model as 3MF download */
    export3MF() {
      if (currentMeshData) export3MF(currentMeshData);
    },

    /** Validate code without rendering. Returns { valid, error? } */
    validate(code: string): { valid: boolean; error?: string } {
      const result = executeCode(code);
      if (result.error) return { valid: false, error: result.error };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (result.manifold as any)?.delete?.(); } catch { /* ignore */ }
      return { valid: true };
    },

    // === Clipping API ===

    /** Toggle clipping plane on/off */
    toggleClip(enabled?: boolean) {
      const on = enabled ?? !getClipState().enabled;
      setClipping(on);
      syncClipUI();
      return getClipState();
    },

    /** Set clipping plane Z height */
    setClipZ(z: number) {
      setClipZ(z);
      syncClipUI();
      return getClipState();
    },

    /** Get current clip state */
    getClipState() {
      return getClipState();
    },

    // === Session API ===

    /** Create a new session and make it active */
    async createSession(name?: string) {
      const session = await createSession(name);
      return { id: session.id, url: getSessionUrl(), galleryUrl: getGalleryUrl() };
    },

    /** List all saved sessions */
    async listSessions() {
      const sessions = await listSessions();
      return sessions.map(s => ({ id: s.id, name: s.name, updated: s.updated }));
    },

    /** Open an existing session (loads latest version) */
    async openSession(id: string) {
      const version = await openSession(id);
      if (version) {
        setValue(version.code);
        runCodeSync(version.code);
      }
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** Close the current session */
    async closeSession() {
      await closeSession();
    },

    /** Delete a session and all its versions */
    async deleteSession(id: string) {
      await deleteSession(id);
    },

    /** Save current state as a new version in the active session */
    async saveVersion(label?: string) {
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

    /** Load a specific version by index */
    async loadVersion(index: number) {
      const version = await loadVersionByIndex(index);
      if (version) {
        setValue(version.code);
        runCodeSync(version.code);
      }
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** Navigate to previous or next version */
    async navigateVersion(direction: 'prev' | 'next') {
      const version = await navigateVersion(direction);
      if (version) {
        setValue(version.code);
        runCodeSync(version.code);
      }
      return version ? { id: version.id, index: version.index, label: version.label } : null;
    },

    /** Run code and save as a new version in one call. Returns stat diff vs previous version. */
    async runAndSave(code: string, label?: string) {
      const prevGeoData = getState().currentVersion?.geometryData as Record<string, unknown> | null;

      setValue(code);
      runCodeSync(code);
      const newGeoData = JSON.parse(geometryDataEl.textContent || '{}');
      const thumbnail = await captureThumbnail();
      const version = await saveVersion(code, getGeometryDataObj(), thumbnail, label);

      let diff = null;
      if (prevGeoData && prevGeoData.status === 'ok' && newGeoData.status === 'ok') {
        diff = computeStatDiff(prevGeoData, newGeoData);
      }

      return {
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

    /** Export a session as JSON (defaults to current session) */
    async exportSession(sessionId?: string) {
      return exportSession(sessionId);
    },

    /** Import a session from JSON data, regenerating thumbnails */
    async importSession(data: ExportedSession) {
      const session = await importSession(data, async (code: string) => {
        runCodeSync(code);
        return captureThumbnail();
      });
      const version = await openSession(session.id);
      if (version) {
        setValue(version.code);
        runCodeSync(version.code);
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
      const { geometryData, meshData, manifold } = executeIsolated(code);

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
      const { geometryData, manifold } = executeIsolated(code);

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
      const { geometryData, manifold } = executeIsolated(code);

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

      // Clean up
      try { m.delete?.(); } catch { /* ignore */ }

      // Generate hint
      let hint: string | undefined;
      if (components && components.length > 1) {
        const sorted = [...components].sort((a, b) => b.volume - a.volume);
        const mainVol = sorted[0].volume;
        const small = sorted.filter(c => c.volume < mainVol * 0.01);
        if (small.length > 0) {
          hint = `${small.length} tiny disconnected component(s) detected — likely floating attachments that failed to union. Check overlap at centroids: ${small.map(c => `[${c.centroid}]`).join(', ')}`;
        } else {
          hint = `${components.length} components of similar size — major geometry sections are not connected`;
        }
      }

      return { stats: geometryData, components, hint };
    },

    /** Create a session and populate it with multiple versions in one call */
    async createSessionWithVersions(name: string, versions: { code: string; label?: string }[]) {
      const session = await createSession(name);
      const results = [];

      for (const v of versions) {
        setValue(v.code);
        runCodeSync(v.code);
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
  };

  (window as unknown as Record<string, unknown>).mainifold = mainifoldAPI;

  // Log API availability for AI agents
  console.log(
    '%c[mAInifold]%c Console API available at %cwindow.mainifold%c\n' +
    'Methods: .run(code?), .getGeometryData(), .getCode(), .setCode(code),\n' +
    '         .sliceAtZ(z), .getBoundingBox(), .validate(code),\n' +
    '         .toggleClip(on?), .setClipZ(z), .getClipState(),\n' +
    '         .getModule(), .exportGLB(), .exportSTL(), .exportOBJ(), .export3MF()\n' +
    'Isolated: .runIsolated(code), .runAndAssert(code, assertions),\n' +
    '          .runAndExplain(code), .isRunning()\n' +
    'Sessions: .createSession(name?), .saveVersion(label?), .runAndSave(code, label?),\n' +
    '          .createSessionWithVersions(name, [{code,label},...]),\n' +
    '          .listSessions(), .openSession(id), .listVersions(), .loadVersion(idx),\n' +
    '          .getGalleryUrl(), .getSessionUrl(), .getSessionState(),\n' +
    '          .exportSession(id?), .importSession(data), .clearAllSessions()\n' +
    'Structured data: document.getElementById("geometry-data").textContent',
    'color: #4ade80; font-weight: bold',
    'color: inherit',
    'color: #60a5fa; font-weight: bold',
    'color: inherit',
  );

  // === Internal functions ===

  function runCode(code?: string) {
    const src = code ?? getValue();
    setStatus(statusBar, 'running', 'Running...');

    requestAnimationFrame(() => {
      runCodeSync(src);
    });
  }

  function runCodeSync(src: string) {
    _running = true;
    const t0 = performance.now();
    const result = executeCode(src);
    const elapsed = Math.round(performance.now() - t0);
    _running = false;

    if (result.error) {
      setStatus(statusBar, 'error', result.error);
      geometryDataEl.textContent = JSON.stringify({ status: 'error', error: result.error, executionTimeMs: elapsed, codeHash: simpleHash(src) });
      return;
    }

    if (result.mesh) {
      currentMeshData = result.mesh;
      currentManifold = result.manifold;
      updateMesh(result.mesh);
      updateMultiView(result.mesh);
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

main().catch(console.error);
