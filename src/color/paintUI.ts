// Paint mode UI — button toggle, color picker, region count badge, tool
// selection (bucket / brush / slab), and undo/redo/hide/clear actions.

import {
  activate,
  deactivate,
  isActive,
  setColor,
  getColor,
  setTool,
  getTool,
  setBucketTolerance,
  getBucketTolerance,
  getCurrentMesh,
  previewTriangles,
  type PaintTool,
} from './paintMode';
import {
  addRegion,
  getRegions,
  onChange as onRegionsChange,
  onRedoChange,
  onVisibilityChange,
  isVisible as isPaintVisible,
  setVisible as setPaintVisible,
  removeLastRegion,
  redoLastRegion,
  canRedoRegion,
  clearRegions,
} from './regions';
import { projectionRange, findSlabTriangles, AXIS_NORMALS } from './slabPaint';
import { forceDeactivate as forceDeactivateAnnotate } from '../annotations/annotateUI';
import { forceDeactivate as forceDeactivateAnnotateText } from '../annotations/textMode';
import { forceDeactivate as forceDeactivateAnnotateSelect } from '../annotations/selectMode';

const PRESET_COLORS: [number, number, number][] = [
  [0.92, 0.26, 0.21], // red
  [0.13, 0.59, 0.95], // blue
  [0.30, 0.69, 0.31], // green
  [1.00, 0.76, 0.03], // yellow
  [0.61, 0.15, 0.69], // purple
  [1.00, 0.60, 0.00], // orange
  [0.00, 0.74, 0.83], // teal
  [0.91, 0.12, 0.39], // pink
];

let paintBtn: HTMLButtonElement | null = null;
let pickerPanel: HTMLElement | null = null;
let regionCountBadge: HTMLElement | null = null;
let visibilityBtn: HTMLButtonElement | null = null;
let undoBtn: HTMLButtonElement | null = null;
let redoBtn: HTMLButtonElement | null = null;
let toolButtons: Partial<Record<PaintTool, HTMLButtonElement>> = {};
let bucketControls: HTMLElement | null = null;
let slabControls: HTMLElement | null = null;

// Slab UI state
type SlabAxis = 'x' | 'y' | 'z';
let slabAxis: SlabAxis = 'z';
let slabOffsetInput: HTMLInputElement | null = null;
let slabThicknessInput: HTMLInputElement | null = null;
let slabOffsetValue: HTMLElement | null = null;
let slabThicknessValue: HTMLElement | null = null;
let slabPreviewTeardown: (() => void) | null = null;
let slabInputsInitialized = false;

/** Initialize the paint UI inside the clip-controls overlay area. */
export function initPaintUI(controlsContainer: HTMLElement): void {
  paintBtn = document.createElement('button');
  paintBtn.id = 'paint-toggle';
  paintBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  paintBtn.textContent = '\uD83C\uDFA8 Paint';
  paintBtn.title = 'Paint color regions on model faces';

  regionCountBadge = document.createElement('span');
  regionCountBadge.className = 'hidden ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white leading-none';
  paintBtn.appendChild(regionCountBadge);

  paintBtn.addEventListener('click', togglePaintMode);

  const measureBtn = controlsContainer.querySelector('#measure-toggle');
  if (measureBtn) {
    controlsContainer.insertBefore(paintBtn, measureBtn);
  } else {
    controlsContainer.appendChild(paintBtn);
  }

  pickerPanel = createPickerPanel();
  controlsContainer.appendChild(pickerPanel);

  onRegionsChange(() => {
    updateBadge();
    updateUndoButton();
  });
  onRedoChange(updateRedoButton);
  onVisibilityChange(updateVisibilityButton);
  updateBadge();
  updateUndoButton();
  updateRedoButton();
  updateVisibilityButton();
}

function togglePaintMode(): void {
  if (isActive()) {
    deactivate();
    updateButtonState(false);
    pickerPanel?.classList.add('hidden');
    teardownSlabPreview();
    slabInputsInitialized = false;
  } else {
    forceDeactivateAnnotate();
    forceDeactivateAnnotateText();
    forceDeactivateAnnotateSelect();
    activate();
    updateButtonState(true);
    pickerPanel?.classList.remove('hidden');
    syncToolPanels();
  }
}

function updateButtonState(active: boolean): void {
  if (!paintBtn) return;
  if (active) {
    paintBtn.className = 'px-2 py-1 rounded text-xs bg-blue-500/30 backdrop-blur text-blue-300 border border-blue-500/50 transition-colors';
  } else {
    paintBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  }
}

function updateBadge(): void {
  if (!regionCountBadge) return;
  const count = getRegions().length;
  if (count > 0) {
    regionCountBadge.textContent = String(count);
    regionCountBadge.classList.remove('hidden');
  } else {
    regionCountBadge.classList.add('hidden');
  }
}

function createPickerPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'paint-picker-panel';
  panel.className = 'hidden absolute top-10 right-2 z-20 bg-zinc-800/95 backdrop-blur border border-zinc-600/60 rounded-lg p-2.5 shadow-xl';
  panel.style.minWidth = '200px';
  panel.style.maxWidth = '240px';

  // === Tool selector ===
  const toolTitle = document.createElement('div');
  toolTitle.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-medium';
  toolTitle.textContent = 'Tool';
  panel.appendChild(toolTitle);

  const toolRow = document.createElement('div');
  toolRow.className = 'grid grid-cols-3 gap-1 mb-2.5';
  toolRow.appendChild(createToolButton('bucket', '\u{1FAA3} Bucket', 'Flood-fill across coplanar faces'));
  toolRow.appendChild(createToolButton('brush', '\u{1F58C}\uFE0F Brush', 'Paint individual triangles (drag to paint)'));
  toolRow.appendChild(createToolButton('slab', '\u{1F9F1} Slab', 'Paint all faces inside a slab range'));
  panel.appendChild(toolRow);

  // === Color picker ===
  const title = document.createElement('div');
  title.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-medium';
  title.textContent = 'Color';
  panel.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-4 gap-1.5 mb-2';

  for (const color of PRESET_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'w-6 h-6 rounded border-2 border-transparent hover:border-white/50 transition-colors';
    swatch.style.backgroundColor = rgbToCSS(color);
    swatch.title = rgbToHex(color);
    swatch.addEventListener('click', () => {
      setColor(color);
      updateActiveSwatch(grid, swatch);
    });
    grid.appendChild(swatch);
  }
  const first = grid.children[0] as HTMLElement;
  if (first) first.classList.add('border-white/80', 'ring-1', 'ring-white/30');
  panel.appendChild(grid);

  const customRow = document.createElement('div');
  customRow.className = 'flex items-center gap-1.5';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = rgbToHex(PRESET_COLORS[0]);
  colorInput.className = 'w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent';
  colorInput.title = 'Custom color';
  colorInput.addEventListener('input', () => {
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    setColor([r, g, b]);
    for (const child of Array.from(grid.children)) {
      (child as HTMLElement).classList.remove('border-white/80', 'ring-1', 'ring-white/30');
    }
  });

  const customLabel = document.createElement('span');
  customLabel.className = 'text-[10px] text-zinc-500';
  customLabel.textContent = 'Custom';

  customRow.appendChild(colorInput);
  customRow.appendChild(customLabel);
  panel.appendChild(customRow);

  // === Bucket tool controls (tolerance slider) ===
  bucketControls = createBucketControls();
  panel.appendChild(bucketControls);

  // === Slab tool controls ===
  slabControls = createSlabControls();
  panel.appendChild(slabControls);

  // === Region list ===
  const regionList = document.createElement('div');
  regionList.id = 'paint-region-list';
  regionList.className = 'mt-2 border-t border-zinc-700 pt-2 max-h-32 overflow-y-auto';
  panel.appendChild(regionList);

  onRegionsChange(() => updateRegionList(regionList));

  // === Action row ===
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-700 flex-wrap';

  visibilityBtn = document.createElement('button');
  visibilityBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors';
  visibilityBtn.title = 'Toggle paint region visibility in viewport (exports keep colors regardless)';
  visibilityBtn.addEventListener('click', () => { setPaintVisible(!isPaintVisible()); });
  actions.appendChild(visibilityBtn);

  undoBtn = document.createElement('button');
  undoBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors opacity-40 cursor-not-allowed';
  undoBtn.textContent = 'Undo paint';
  undoBtn.title = 'Remove the most recent paint region';
  undoBtn.disabled = true;
  undoBtn.addEventListener('click', () => { removeLastRegion(); });
  actions.appendChild(undoBtn);

  redoBtn = document.createElement('button');
  redoBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors opacity-40 cursor-not-allowed';
  redoBtn.textContent = 'Redo paint';
  redoBtn.title = 'Restore the most recently undone paint region';
  redoBtn.disabled = true;
  redoBtn.addEventListener('click', () => { redoLastRegion(); });
  actions.appendChild(redoBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'px-2 py-1 rounded text-[10px] bg-red-700/60 text-red-200 hover:bg-red-600/60 transition-colors';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Remove all paint regions';
  clearBtn.addEventListener('click', () => { clearRegions(); });
  actions.appendChild(clearBtn);

  panel.appendChild(actions);

  return panel;
}

function createToolButton(tool: PaintTool, label: string, tooltip: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = toolButtonClass(tool === getTool());
  btn.textContent = label;
  btn.title = tooltip;
  btn.addEventListener('click', () => {
    setTool(tool);
    syncToolPanels();
  });
  toolButtons[tool] = btn;
  return btn;
}

function toolButtonClass(active: boolean): string {
  if (active) {
    return 'px-1.5 py-1 rounded text-[10px] bg-blue-500/30 text-blue-200 border border-blue-500/50 transition-colors text-center';
  }
  return 'px-1.5 py-1 rounded text-[10px] bg-zinc-700/40 text-zinc-300 hover:bg-zinc-600/60 border border-transparent transition-colors text-center';
}

function syncToolPanels(): void {
  const tool = getTool();
  for (const [t, btn] of Object.entries(toolButtons)) {
    if (btn) btn.className = toolButtonClass(t === tool);
  }
  if (bucketControls) bucketControls.classList.toggle('hidden', tool !== 'bucket');
  if (slabControls) {
    slabControls.classList.toggle('hidden', tool !== 'slab');
    if (tool === 'slab') {
      refreshSlabRange();
      updateSlabPreview();
    } else {
      teardownSlabPreview();
    }
  }
}

function createBucketControls(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mt-2 pt-2 border-t border-zinc-700';

  const label = document.createElement('div');
  label.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-medium flex items-center justify-between';
  const labelText = document.createElement('span');
  labelText.textContent = 'Bucket tolerance';
  const valueSpan = document.createElement('span');
  valueSpan.className = 'text-zinc-400 normal-case tracking-normal';
  valueSpan.textContent = formatTolerance(getBucketTolerance());
  label.appendChild(labelText);
  label.appendChild(valueSpan);
  wrap.appendChild(label);

  // Slider exposes 1 - tolerance on a quasi-log scale so small changes near
  // 1.0 (the strict end) are easy to dial in.
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(toleranceToSliderPct(getBucketTolerance()));
  slider.className = 'w-full accent-blue-500';
  slider.title = 'How aggressively flood-fill spreads across near-coplanar faces';
  slider.addEventListener('input', () => {
    const tol = sliderPctToTolerance(parseInt(slider.value, 10));
    setBucketTolerance(tol);
    valueSpan.textContent = formatTolerance(tol);
  });
  wrap.appendChild(slider);

  const help = document.createElement('div');
  help.className = 'text-[10px] text-zinc-500 mt-1';
  help.textContent = 'Strict \u2190\u2014\u2014\u2192 Loose (more curved bleed)';
  wrap.appendChild(help);

  return wrap;
}

function toleranceToSliderPct(tol: number): number {
  // tol in [0,1]. Map (1 - tol) in [0, 0.05] to slider 0..100 with sqrt curve.
  // tol = 1 -> 0 (strictest); tol = 0.95 -> 100 (loosest practical)
  const inv = Math.max(0, Math.min(0.05, 1 - tol));
  return Math.round(Math.sqrt(inv / 0.05) * 100);
}

function sliderPctToTolerance(pct: number): number {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const inv = (t * t) * 0.05;
  return Math.max(0.95, Math.min(1, 1 - inv));
}

function formatTolerance(tol: number): string {
  // Show as "θ ≤ N°" — the angle whose cosine is `tol`. Friendlier than 0.9995.
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, tol))) * 180 / Math.PI;
  return `\u2264 ${angleDeg.toFixed(1)}\u00B0`;
}

function createSlabControls(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mt-2 pt-2 border-t border-zinc-700 hidden';

  // Axis selector
  const axisRow = document.createElement('div');
  axisRow.className = 'mb-2';
  const axisLabel = document.createElement('div');
  axisLabel.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-medium';
  axisLabel.textContent = 'Slab axis';
  axisRow.appendChild(axisLabel);

  const axisBtns = document.createElement('div');
  axisBtns.className = 'grid grid-cols-3 gap-1';
  for (const axis of ['x', 'y', 'z'] as const) {
    const btn = document.createElement('button');
    btn.dataset.axis = axis;
    btn.textContent = axis.toUpperCase();
    btn.className = axisButtonClass(axis === slabAxis);
    btn.addEventListener('click', () => {
      slabAxis = axis;
      for (const child of Array.from(axisBtns.children)) {
        const el = child as HTMLButtonElement;
        el.className = axisButtonClass(el.dataset.axis === slabAxis);
      }
      // Axis change: re-seed slider to the new axis's defaults.
      slabInputsInitialized = false;
      refreshSlabRange();
      updateSlabPreview();
    });
    axisBtns.appendChild(btn);
  }
  axisRow.appendChild(axisBtns);
  wrap.appendChild(axisRow);

  // Offset slider
  const offsetWrap = document.createElement('div');
  offsetWrap.className = 'mb-2';
  const offsetLabel = document.createElement('div');
  offsetLabel.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-medium flex items-center justify-between';
  const offsetText = document.createElement('span');
  offsetText.textContent = 'Offset';
  slabOffsetValue = document.createElement('span');
  slabOffsetValue.className = 'text-zinc-400 normal-case tracking-normal';
  slabOffsetValue.textContent = '0';
  offsetLabel.appendChild(offsetText);
  offsetLabel.appendChild(slabOffsetValue);
  offsetWrap.appendChild(offsetLabel);

  slabOffsetInput = document.createElement('input');
  slabOffsetInput.type = 'range';
  slabOffsetInput.className = 'w-full accent-blue-500';
  slabOffsetInput.title = 'Slide the slab along the chosen axis';
  slabOffsetInput.addEventListener('input', updateSlabPreview);
  offsetWrap.appendChild(slabOffsetInput);
  wrap.appendChild(offsetWrap);

  // Thickness slider
  const thickWrap = document.createElement('div');
  thickWrap.className = 'mb-2';
  const thickLabel = document.createElement('div');
  thickLabel.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-medium flex items-center justify-between';
  const thickText = document.createElement('span');
  thickText.textContent = 'Thickness';
  slabThicknessValue = document.createElement('span');
  slabThicknessValue.className = 'text-zinc-400 normal-case tracking-normal';
  slabThicknessValue.textContent = '0';
  thickLabel.appendChild(thickText);
  thickLabel.appendChild(slabThicknessValue);
  thickWrap.appendChild(thickLabel);

  slabThicknessInput = document.createElement('input');
  slabThicknessInput.type = 'range';
  slabThicknessInput.className = 'w-full accent-blue-500';
  slabThicknessInput.title = 'Width of the slab along the chosen axis';
  slabThicknessInput.addEventListener('input', updateSlabPreview);
  thickWrap.appendChild(slabThicknessInput);
  wrap.appendChild(thickWrap);

  // Apply button
  const apply = document.createElement('button');
  apply.className = 'w-full px-2 py-1.5 rounded text-[11px] bg-blue-600 hover:bg-blue-500 text-white transition-colors font-medium';
  apply.textContent = 'Paint slab';
  apply.title = 'Apply the slab selection as a paint region';
  apply.addEventListener('click', applySlab);
  wrap.appendChild(apply);

  return wrap;
}

function axisButtonClass(active: boolean): string {
  if (active) {
    return 'px-2 py-1 rounded text-[11px] bg-blue-500/30 text-blue-200 border border-blue-500/50 transition-colors';
  }
  return 'px-2 py-1 rounded text-[11px] bg-zinc-700/40 text-zinc-300 hover:bg-zinc-600/60 border border-transparent transition-colors';
}

function refreshSlabRange(): void {
  const mesh = getCurrentMesh();
  if (!mesh || !slabOffsetInput || !slabThicknessInput) return;

  const range = projectionRange(mesh, AXIS_NORMALS[slabAxis]);
  const span = Math.max(1e-6, range.max - range.min);
  const step = roundStep(span / 200);

  // Pad each side by ~1% so the slab can slide just past the model.
  const pad = span * 0.01;

  slabOffsetInput.min = String(range.min - pad);
  slabOffsetInput.max = String(range.max + pad);
  slabOffsetInput.step = String(step);

  // Default offset = bottom of bounds; thickness = 20% of span (or smaller if tiny)
  const defaultOffset = range.min;
  const defaultThickness = Math.max(step, span * 0.2);

  if (!slabInputsInitialized) {
    slabOffsetInput.value = String(defaultOffset);
  } else {
    const cur = parseFloat(slabOffsetInput.value);
    if (!Number.isFinite(cur) || cur < range.min - pad || cur > range.max + pad) {
      slabOffsetInput.value = String(defaultOffset);
    }
  }

  slabThicknessInput.min = String(step);
  slabThicknessInput.max = String(span);
  slabThicknessInput.step = String(step);
  if (!slabInputsInitialized) {
    slabThicknessInput.value = String(defaultThickness);
  } else {
    const cur = parseFloat(slabThicknessInput.value);
    if (!Number.isFinite(cur) || cur > span) slabThicknessInput.value = String(Math.min(span, defaultThickness));
    else if (cur < step) slabThicknessInput.value = String(step);
  }

  slabInputsInitialized = true;
}

function roundStep(s: number): number {
  if (s <= 0) return 0.01;
  // Round to one significant digit (e.g. 0.0345 -> 0.03)
  const exp = Math.floor(Math.log10(s));
  const mantissa = s / Math.pow(10, exp);
  const rounded = Math.round(mantissa);
  return Math.max(1e-6, rounded * Math.pow(10, exp));
}

function updateSlabPreview(): void {
  const mesh = getCurrentMesh();
  if (!mesh || !slabOffsetInput || !slabThicknessInput) return;

  const offset = parseFloat(slabOffsetInput.value);
  const thickness = parseFloat(slabThicknessInput.value);
  const normal = AXIS_NORMALS[slabAxis];

  if (slabOffsetValue) slabOffsetValue.textContent = formatNumber(offset);
  if (slabThicknessValue) slabThicknessValue.textContent = formatNumber(thickness);

  const triangles = findSlabTriangles(mesh, normal, offset, thickness);
  teardownSlabPreview();
  if (triangles.size > 0) {
    slabPreviewTeardown = previewTriangles(triangles);
  }
}

function teardownSlabPreview(): void {
  if (slabPreviewTeardown) {
    slabPreviewTeardown();
    slabPreviewTeardown = null;
  }
}

function applySlab(): void {
  const mesh = getCurrentMesh();
  if (!mesh || !slabOffsetInput || !slabThicknessInput) return;

  const offset = parseFloat(slabOffsetInput.value);
  const thickness = parseFloat(slabThicknessInput.value);
  const normal = AXIS_NORMALS[slabAxis];

  const triangles = findSlabTriangles(mesh, normal, offset, thickness);
  if (triangles.size === 0) return;

  teardownSlabPreview();

  const existingCount = getRegions().length;
  const name = `Slab ${slabAxis.toUpperCase()} ${existingCount + 1}`;
  addRegion(
    name,
    [...getColor()] as [number, number, number],
    'slab',
    { kind: 'slab', normal, offset, thickness },
    triangles,
  );
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return '0';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return n.toFixed(digits);
}

function updateVisibilityButton(): void {
  if (!visibilityBtn) return;
  visibilityBtn.textContent = isPaintVisible() ? 'Hide' : 'Show';
}

function updateUndoButton(): void {
  if (!undoBtn) return;
  const can = getRegions().length > 0;
  undoBtn.disabled = !can;
  undoBtn.classList.toggle('opacity-40', !can);
  undoBtn.classList.toggle('cursor-not-allowed', !can);
}

function updateRedoButton(): void {
  if (!redoBtn) return;
  const can = canRedoRegion();
  redoBtn.disabled = !can;
  redoBtn.classList.toggle('opacity-40', !can);
  redoBtn.classList.toggle('cursor-not-allowed', !can);
}

function updateActiveSwatch(grid: HTMLElement, activeSwatch: HTMLElement): void {
  for (const child of Array.from(grid.children)) {
    (child as HTMLElement).classList.remove('border-white/80', 'ring-1', 'ring-white/30');
  }
  activeSwatch.classList.add('border-white/80', 'ring-1', 'ring-white/30');
}

function updateRegionList(container: HTMLElement): void {
  const regions = getRegions();
  container.innerHTML = '';

  if (regions.length === 0) return;

  for (const region of regions) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 py-0.5';

    const dot = document.createElement('span');
    dot.className = 'w-3 h-3 rounded-sm shrink-0';
    dot.style.backgroundColor = rgbToCSS(region.color);

    const label = document.createElement('span');
    label.className = 'text-[11px] text-zinc-400 truncate flex-1';
    label.textContent = region.name;

    const count = document.createElement('span');
    count.className = 'text-[10px] text-zinc-600';
    count.textContent = `${region.triangles.size}\u25B3`;

    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(count);
    container.appendChild(row);
  }
}

function rgbToCSS(color: [number, number, number]): string {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

function rgbToHex(color: [number, number, number]): string {
  const r = Math.round(color[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(color[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(color[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Deactivate paint mode externally (e.g. when switching tabs). */
export function forceDeactivate(): void {
  if (isActive()) {
    deactivate();
    updateButtonState(false);
    pickerPanel?.classList.add('hidden');
    teardownSlabPreview();
    slabInputsInitialized = false;
  }
}

/** True if the paint menu is open (paint mode is active). */
export function isPaintOpen(): boolean {
  return isActive();
}
