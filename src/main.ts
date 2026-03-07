import './style.css';
import { initEngine, executeCode, getModule } from './geometry/engine';
import { sliceAtZ, getBoundingBox } from './geometry/crossSection';
import { initViewport, updateMesh } from './renderer/viewport';
import { initEditor, setValue, getValue } from './editor/codeEditor';
import { createLayout } from './ui/layout';
import { createToolbar } from './ui/toolbar';
import { initViewsPanel, updateMultiView } from './ui/panels';
import { exportGLB } from './export/gltf';
import { exportSTL } from './export/stl';
import type { MeshData } from './geometry/types';

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

function updateGeometryData(executionTimeMs?: number, sourceCode?: string) {
  if (!currentManifold || !currentMeshData) {
    geometryDataEl.textContent = JSON.stringify({ status: 'error', error: 'No geometry' });
    return;
  }

  const bbox = getBoundingBox(currentManifold);

  let volume = 0;
  let surfaceArea = 0;
  try {
    volume = currentManifold.volume();
    surfaceArea = currentManifold.surfaceArea();
  } catch {
    // fallback if methods unavailable
  }

  // Centroid approximation from bounding box center
  const centroid = bbox
    ? [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2]
    : null;

  // Dimensions
  const dimensions = bbox
    ? [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]]
    : null;

  // Component count
  let componentCount = 1;
  try {
    const parts = currentManifold.decompose();
    componentCount = parts.length;
    for (const p of parts) p.delete();
  } catch {
    // fallback
  }

  // Is manifold (status 0 = ok)
  let isManifold = true;
  try {
    isManifold = currentManifold.status() === 0;
  } catch {
    // fallback
  }

  // Cross-sections at quartiles
  const quartileSlices: Record<string, { z: number; area: number; contours: number }> = {};
  if (bbox) {
    const zRange = bbox.max[2] - bbox.min[2];
    for (const pct of [25, 50, 75]) {
      const z = bbox.min[2] + zRange * (pct / 100);
      const s = sliceAtZ(currentManifold, z);
      if (s) {
        quartileSlices[`z${pct}`] = { z, area: s.area, contours: s.polygons.length };
      }
    }
  }

  const data = {
    status: 'ok' as const,
    vertexCount: currentMeshData.numVert,
    triangleCount: currentMeshData.numTri,
    boundingBox: bbox ? {
      x: [bbox.min[0], bbox.max[0]],
      y: [bbox.min[1], bbox.max[1]],
      z: [bbox.min[2], bbox.max[2]],
      dimensions,
    } : null,
    centroid,
    volume,
    surfaceArea,
    genus: (() => { try { return currentManifold.genus(); } catch { return null; } })(),
    isManifold,
    componentCount,
    crossSections: quartileSlices,
    executionTimeMs: executionTimeMs ?? null,
    codeHash: sourceCode ? simpleHash(sourceCode) : null,
  };

  geometryDataEl.textContent = JSON.stringify(data, null, 2);
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
    onSection: () => toggleSection(),
    onExportGLB: async () => {
      try { await exportGLB(); } catch (e) { console.error('GLB export error:', e); }
    },
    onExportSTL: () => {
      if (currentMeshData) exportSTL(currentMeshData);
    },
    onExampleSelect: (code: string) => {
      setValue(code);
      runCode(code);
    },
  });

  // Create layout
  const { editorContainer, viewportPane, viewsContainer, statusBar, sectionPanel } = createLayout(app);

  // Init views panel (always visible)
  initViewsPanel(viewsContainer);

  // Init geometry engine
  setStatus(statusBar, 'loading', 'Loading WASM...');
  await initEngine();

  // Init viewport
  initViewport(viewportPane);

  // Init editor
  initEditor(editorContainer, defaultCode, (code: string) => {
    runCode(code);
  });

  // Wire up cross-section panel
  initSectionPanel(sectionPanel);

  // Initial run
  setStatus(statusBar, 'ready', 'Ready');
  runCode(defaultCode);

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

    /** Validate code without rendering. Returns { valid, error? } */
    validate(code: string): { valid: boolean; error?: string } {
      const result = executeCode(code);
      if (result.error) return { valid: false, error: result.error };
      return { valid: true };
    },
  };

  (window as unknown as Record<string, unknown>).mainifold = mainifoldAPI;

  // Log API availability for AI agents
  console.log(
    '%c[mAInifold]%c Console API available at %cwindow.mainifold%c\n' +
    'Methods: .run(code?), .getGeometryData(), .getCode(), .setCode(code),\n' +
    '         .sliceAtZ(z), .getBoundingBox(), .validate(code),\n' +
    '         .getModule(), .exportGLB(), .exportSTL()\n' +
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
    const t0 = performance.now();
    const result = executeCode(src);
    const elapsed = Math.round(performance.now() - t0);

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
      updateSectionSlider(sectionPanel);
      setStatus(statusBar, 'ready', 'Ready');
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

function toggleSection() {
  const panel = document.getElementById('section-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    updateSectionSlider(panel);
  }
}

function initSectionPanel(panel: HTMLElement) {
  const toggle = panel.querySelector('#section-toggle');
  const content = panel.querySelector('#section-content') as HTMLElement;
  const chevron = panel.querySelector('#section-chevron');

  toggle?.addEventListener('click', () => {
    content.classList.toggle('hidden');
    if (chevron) {
      chevron.textContent = content.classList.contains('hidden') ? '\u25BE' : '\u25B4';
    }
  });

  const slider = panel.querySelector('#z-slider') as HTMLInputElement;
  slider?.addEventListener('input', () => {
    updateSectionPreview(panel, parseFloat(slider.value));
  });

  // Copy SVG
  panel.querySelector('#btn-copy-svg')?.addEventListener('click', async () => {
    const svgEl = panel.querySelector('#svg-preview svg');
    if (svgEl) {
      await navigator.clipboard.writeText(svgEl.outerHTML);
    }
  });

  // Copy JSON
  panel.querySelector('#btn-copy-json')?.addEventListener('click', async () => {
    if (!currentManifold) return;
    const slider = panel.querySelector('#z-slider') as HTMLInputElement;
    const z = parseFloat(slider.value);
    const result = sliceAtZ(currentManifold, z);
    if (result) {
      await navigator.clipboard.writeText(JSON.stringify({
        z,
        polygons: result.polygons,
        boundingBox: result.boundingBox,
        area: result.area,
      }, null, 2));
    }
  });
}

function updateSectionSlider(panel: HTMLElement) {
  if (!currentManifold) return;

  const bbox = getBoundingBox(currentManifold);
  if (!bbox) return;

  const slider = panel.querySelector('#z-slider') as HTMLInputElement;
  if (!slider) return;

  slider.min = bbox.min[2].toString();
  slider.max = bbox.max[2].toString();
  slider.step = ((bbox.max[2] - bbox.min[2]) / 100).toString();

  const midZ = (bbox.min[2] + bbox.max[2]) / 2;
  slider.value = midZ.toString();

  updateSectionPreview(panel, midZ);
}

function updateSectionPreview(panel: HTMLElement, z: number) {
  const zValueEl = panel.querySelector('#z-value');
  if (zValueEl) zValueEl.textContent = z.toFixed(2);

  if (!currentManifold) return;

  const result = sliceAtZ(currentManifold, z);
  const preview = panel.querySelector('#svg-preview');
  const stats = panel.querySelector('#section-stats');

  if (!result || !preview) return;

  preview.innerHTML = result.svg;

  const svg = preview.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');
    svg.style.maxWidth = '300px';
  }

  if (stats) {
    stats.textContent = `Area: ${result.area.toFixed(2)} | Contours: ${result.polygons.length} | Bounds: [${result.boundingBox.minX.toFixed(1)}, ${result.boundingBox.minY.toFixed(1)}] to [${result.boundingBox.maxX.toFixed(1)}, ${result.boundingBox.maxY.toFixed(1)}]`;
  }
}

main().catch(console.error);
