import './style.css';
import { initEngine, executeCode, getModule } from './geometry/engine';
import { sliceAtZ, getBoundingBox } from './geometry/crossSection';
import { initViewport, updateMesh, setClipping, setClipZ, getClipState, getCameraState, getCanvas, getMeshGroup, getCamera } from './renderer/viewport';
import { renderCompositeCanvas, renderElevationsToContainer, renderSingleView, renderSliceSVG, setReferenceImages as _setRefImages, clearReferenceImages as _clearRefImages, getReferenceImages as _getRefImages, type ReferenceImages } from './renderer/multiview';
import { setPhantom, clearPhantom, hasPhantom, type PhantomOptions } from './renderer/phantomGeometry';
import { initEditor, setValue, getValue } from './editor/codeEditor';
import { createLayout } from './ui/layout';
import { createToolbar, isAutoRun } from './ui/toolbar';
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
import { maybeStartTour } from './ui/tour';
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
  loadVersionByIndex,
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
  type ExportedSession,
  type ReferenceImagesData,
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

  // Load examples
  const examples: Record<string, string> = {};
  for (const [path, loader] of Object.entries(exampleModules)) {
    examples[path] = await loader() as string;
  }

  const defaultExampleKey = Object.keys(examples).find(k => k.includes('basic_shapes')) ?? Object.keys(examples)[0];
  const defaultCode = examples[defaultExampleKey] ?? '// Write your manifold code here\nconst { Manifold } = api;\nreturn Manifold.cube([5,5,5], true);';

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
    onExampleSelect: (code: string) => {
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
    (code: string) => {
      setValue(code);
      runCode(code);
    },
    async (code: string) => {
      runCodeSync(code);
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
          }
        },
      });
    }
    overlayContainer.classList.remove('hidden');
    editorUI.classList.add('hidden');
    if (landingEl) landingEl.classList.add('hidden');
    helpEl.classList.remove('hidden');
    window.history.replaceState(null, '', '/help');
  }

  // Expose showHelp for toolbar
  (window as unknown as Record<string, unknown>).__mainifoldShowHelp = showHelp;

  // Check which page to show before loading heavy resources
  const showLanding = shouldShowLanding();
  const showHelpPage = shouldShowHelp();
  const show404 = shouldShow404();

  if (showLanding) {
    // Show landing page immediately — hide editor UI
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
    landingEl = await createLandingPage(overlayContainer, {
      onOpenEditor: async () => {
        transitionToEditor();
        await ensureEditorReady();
        await createSession();
        setStatus(statusBar, 'ready', 'Ready');
        runCode(defaultCode);
      },
      onOpenHelp: showHelp,
      onOpenSession: async (sid) => {
        transitionToEditor();
        await ensureEditorReady();
        const version = await openSession(sid);
        if (version) {
          setValue(version.code);
          runCode(version.code);
          const refImages = await getReferenceImagesFromSession();
          if (refImages) _setRefImages(refImages as ReferenceImages);
        }
        window.history.replaceState(null, '', `/editor?session=${sid}`);
      },
    });
  } else if (showHelpPage) {
    // Show help page immediately
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
    helpEl = createHelpPage(overlayContainer, {
      onBack: async () => {
        helpEl?.classList.add('hidden');
        transitionToEditor();
        await ensureEditorReady();
        if (!getState().session) {
          await createSession();
          runCode(defaultCode);
        }
      },
    });
  } else if (show404) {
    // Show 404 page — hide editor UI entirely
    editorUI.classList.add('hidden');
    overlayContainer.classList.remove('hidden');
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

  // Wire up measure toggle
  initMeasureToggle(clipControls);

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

  // Clean up empty auto-created sessions when leaving the page
  window.addEventListener('beforeunload', () => {
    const state = getState();
    if (state.session && state.versionCount === 0) {
      deleteIfEmpty(state.session.id);
    }
  });

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

    /** Export current model as GLB download. Optional filename override. */
    async exportGLB(filename?: string) {
      await exportGLB(filename);
    },

    /** Export current model as STL download. Optional filename override. */
    exportSTL(filename?: string) {
      if (currentMeshData) exportSTL(currentMeshData, filename);
    },

    /** Export current model as OBJ download. Optional filename override. */
    exportOBJ(filename?: string) {
      if (currentMeshData) exportOBJ(currentMeshData, filename);
    },

    /** Export current model as 3MF download. Optional filename override. */
    export3MF(filename?: string) {
      if (currentMeshData) export3MF(currentMeshData, filename);
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

    // === View rendering API ===

    /** Render a single view from any camera angle. Returns a data URL (PNG).
     *  elevation: degrees, 0 = horizon, 90 = top-down. Default 30.
     *  azimuth: degrees, 0 = front (-Y), 90 = right (+X). Default 315.
     *  ortho: true for orthographic projection. Default false. */
    renderView(options?: { elevation?: number; azimuth?: number; ortho?: boolean; size?: number }): string | null {
      if (!currentMeshData) return null;
      return renderSingleView(currentMeshData, options ?? {});
    },

    /** Render a cross-section at Z height as an SVG string for visual verification */
    sliceAtZVisual(z: number): { svg: string; area: number; contours: number } | null {
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
      const session = await createSession(name);
      return { id: session.id, url: getSessionUrl(), galleryUrl: getGalleryUrl() };
    },

    /** List all saved sessions */
    async listSessions() {
      const sessions = await listSessions();
      return sessions.map(s => ({ id: s.id, name: s.name, updated: s.updated }));
    },

    /** Open an existing session (loads latest version, restores reference images) */
    async openSession(id: string) {
      const version = await openSession(id);
      if (version) {
        setValue(version.code);
        runCodeSync(version.code);
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

    /** Run code and save as a new version in one call. Returns stat diff vs previous version.
     *  Optional assertions — if provided, validates before saving. Fails fast without saving if assertions don't pass. */
    async runAndSave(code: string, label?: string, assertions?: GeometryAssertions) {
      // If assertions provided, validate in isolation first (no side effects if it fails)
      if (assertions) {
        const { geometryData: testData, manifold: testManifold } = executeIsolated(code);
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
        await createSession(sessionName);
      }

      const prevGeoData = getState().currentVersion?.geometryData as Record<string, unknown> | null;

      setValue(code);
      runCodeSync(code);
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
      await deleteSessionNote(noteId);
      return { success: true };
    },

    /** Update a session note's text by ID */
    async updateSessionNote(noteId: string, text: string) {
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
      const currentCode = getValue();
      let modifiedCode: string;
      try {
        modifiedCode = patchFn(currentCode);
      } catch (e: unknown) {
        return { error: `Patch function failed: ${e instanceof Error ? e.message : String(e)}`, modifiedCode: null, stats: null };
      }

      const { geometryData, manifold } = executeIsolated(modifiedCode);
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

    // === Phase 1: Geometry Intelligence ===

    /** Analyze Z-profile of current geometry — returns features at each height with radii, areas, positions */
    analyzeProfile(sampleCount?: number): ZProfile | null {
      if (!currentManifold) return null;
      const bbox = getBoundingBox(currentManifold);
      if (!bbox) return null;
      return analyzeZProfile(currentManifold, bbox, sampleCount);
    },

    /** Analyze Z-profile of code in isolation — no side effects */
    analyzeProfileIsolated(code: string, sampleCount?: number): { profile: ZProfile | null; stats: Record<string, unknown> } {
      const { geometryData, manifold } = executeIsolated(code);
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
      if (!currentMeshData) return null;
      return probeAtXY(currentMeshData, xy[0], xy[1]);
    },

    /** Euclidean distance between two 3D points */
    measureBetween(p1: [number, number, number], p2: [number, number, number]): number {
      return measureDistance(p1, p2);
    },

    /** General ray query — cast from origin in direction, return all hits */
    probeRay(origin: [number, number, number], direction: [number, number, number]): GeneralRayResult | null {
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
      switchTab(tab);
    },

    /** Rename a session */
    async renameSession(newName: string, id?: string): Promise<void> {
      const targetId = id ?? getState().session?.id;
      if (!targetId) throw new Error('No active session and no id provided');
      await renameSession(targetId, newName);
    },

    // === Phase 3: Reference/Phantom Geometry ===

    /** Set translucent reference geometry for fitment checking. Code is executed in isolation. */
    setReferenceGeometry(code: string, options?: PhantomOptions): { success: boolean; error?: string; boundingBox?: unknown; volume?: number } {
      const result = executeCode(code);
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
      _setUnits(unit);
    },

    /** Get current unit system */
    getUnits(): UnitSystem {
      return _getUnits();
    },

    // === Phase 5: Measuring Tool ===

    /** Toggle interactive measure mode — click two points to measure distance */
    measureMode(enabled?: boolean): void {
      const state = getMeasureState();
      if (enabled === undefined) {
        // Toggle
        if (state.active) deactivateMeasure();
        else activateMeasure();
      } else if (enabled) {
        activateMeasure();
      } else {
        deactivateMeasure();
      }
    },

    /** Get current measurement state */
    getMeasurement(): { active: boolean; point1: [number, number, number] | null; point2: [number, number, number] | null; distance: number | null } {
      return getMeasureState();
    },

    /** Programmatic measurement between two 3D points (no clicking needed) */
    measurePoints(p1: [number, number, number], p2: [number, number, number]): number {
      return measureDistance(p1, p2);
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
    'Intelligence: .analyzeProfile(), .analyzeProfileIsolated(code),\n' +
    '              .measureAt([x,y]), .measureBetween(p1,p2), .probeRay(origin,dir),\n' +
    '              .checkContainment()\n' +
    'View: .getViewState(), .setView(tab), .setUnits(unit), .getUnits()\n' +
    'Phantom: .setReferenceGeometry(code, opts?), .clearReferenceGeometry(),\n' +
    '         .hasReferenceGeometry()\n' +
    'Measure: .measureMode(enabled?), .getMeasurement(), .measurePoints(p1,p2)\n' +
    'Sessions: .createSession(name?), .saveVersion(label?), .runAndSave(code, label?),\n' +
    '          .createSessionWithVersions(name, [{code,label},...]),\n' +
    '          .listSessions(), .openSession(id), .listVersions(), .loadVersion(idx),\n' +
    '          .renameSession(name, id?), .getGalleryUrl(), .getSessionUrl(),\n' +
    '          .getSessionState(), .getSessionContext(),\n' +
    '          .exportSession(id?), .importSession(data), .clearAllSessions()\n' +
    'Notes: .addSessionNote(text), .listSessionNotes(),\n' +
    '       .updateSessionNote(noteId, text), .deleteSessionNote(noteId)\n' +
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
        measureBtn.className = inactiveClass;
      } else {
        activateMeasure();
        measureBtn.className = activeClass;
      }
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

main().catch(console.error);
