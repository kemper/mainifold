import { resetTour, startTour } from './tour';
import { partwrightMarkSvg } from './brand';
import { getTheme, onThemeChange, toggleTheme } from './theme';

export interface ExampleEntry {
  code: string;
  language: 'manifold-js' | 'scad';
}

export interface ToolbarCallbacks {
  onRun: () => void;
  onExportGLB: () => void;
  onExportSTL: () => void;
  onExportOBJ: () => void;
  onExport3MF: () => void;
  onExportSessionJSON: () => void;
  onExportRawCode: () => void;
  onImportFile: (file: File) => void | Promise<void>;
  onExampleSelect: (entry: ExampleEntry) => void;
  onLanguageSwitch: (lang: 'manifold-js' | 'scad') => void;
  onGoHome: () => void;
}

/** File extensions accepted by the Import button and drag-and-drop. */
export const IMPORT_ACCEPT = '.partwright.json,.json,.js,.scad';

let _autoRun = true;
let _onAutoRunChange: ((on: boolean) => void) | null = null;

/** Whether auto-run on edit is enabled */
export function isAutoRun(): boolean { return _autoRun; }

/** Register a callback for when auto-run state changes */
export function onAutoRunChange(cb: (on: boolean) => void): void { _onAutoRunChange = cb; }

// Language toggle state — managed externally via setToolbarLanguage()
let _langBtnJs: HTMLButtonElement | null = null;
let _langBtnScad: HTMLButtonElement | null = null;
let _currentLang: 'manifold-js' | 'scad' = 'manifold-js';

const LANG_ACTIVE = 'px-2 py-0.5 rounded text-xs font-medium transition-colors bg-zinc-700 text-zinc-100';
const LANG_INACTIVE = 'px-2 py-0.5 rounded text-xs font-medium transition-colors text-zinc-500 hover:text-zinc-300';

function syncLangToggle() {
  if (!_langBtnJs || !_langBtnScad) return;
  _langBtnJs.className = _currentLang === 'manifold-js' ? LANG_ACTIVE : LANG_INACTIVE;
  _langBtnScad.className = _currentLang === 'scad' ? LANG_ACTIVE : LANG_INACTIVE;
}

/** Update the toolbar language toggle from outside (e.g. when opening a session). */
export function setToolbarLanguage(lang: 'manifold-js' | 'scad'): void {
  _currentLang = lang;
  syncLangToggle();
}

export function createToolbar(
  container: HTMLElement,
  examples: Record<string, ExampleEntry>,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700 text-sm shrink-0';

  // Logo — clicking returns to the landing page
  const logo = document.createElement('button');
  logo.type = 'button';
  logo.className = 'flex items-center gap-2 mr-4 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity';
  logo.title = 'Back to home';
  logo.setAttribute('aria-label', 'Partwright home');
  logo.innerHTML = `${partwrightMarkSvg(20)}<span class="text-zinc-100 font-semibold tracking-tight">Partwright</span>`;
  logo.addEventListener('click', callbacks.onGoHome);
  toolbar.appendChild(logo);

  // Auto-run toggle + manual Run button
  const runGroup = document.createElement('div');
  runGroup.className = 'flex items-center gap-1';

  const autoRunBtn = document.createElement('button');
  autoRunBtn.id = 'btn-auto-run';
  autoRunBtn.title = 'Auto-render is ON — code re-renders as you type. Click to pause.';

  const btnRun = createButton('btn-run', '\u25B6 Run');
  btnRun.addEventListener('click', callbacks.onRun);
  btnRun.classList.add('hidden');

  function syncAutoRunUI() {
    if (_autoRun) {
      autoRunBtn.className = 'flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400 hover:bg-zinc-700 transition-colors';
      autoRunBtn.textContent = '\u23F8 Auto';
      autoRunBtn.title = 'Auto-render is ON \u2014 code re-renders as you type. Click to pause.';
      btnRun.classList.add('hidden');
    } else {
      autoRunBtn.className = 'flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors';
      autoRunBtn.textContent = '\u25B6 Auto';
      autoRunBtn.title = 'Auto-render is OFF \u2014 click to resume, or use the Run button.';
      btnRun.classList.remove('hidden');
    }
  }

  autoRunBtn.addEventListener('click', () => {
    _autoRun = !_autoRun;
    syncAutoRunUI();
    if (_onAutoRunChange) _onAutoRunChange(_autoRun);
    // If re-enabling auto-run, trigger an immediate render
    if (_autoRun) callbacks.onRun();
  });

  syncAutoRunUI();
  runGroup.appendChild(autoRunBtn);
  runGroup.appendChild(btnRun);
  toolbar.appendChild(runGroup);

  // Language toggle — segmented JS / SCAD control
  const langGroup = document.createElement('div');
  langGroup.id = 'lang-toggle';
  langGroup.className = 'flex items-center bg-zinc-800 border border-zinc-600 rounded ml-2';
  langGroup.title = 'Modeling language';

  _langBtnJs = document.createElement('button');
  _langBtnJs.textContent = 'JS';
  _langBtnJs.addEventListener('click', () => {
    if (_currentLang !== 'manifold-js') {
      callbacks.onLanguageSwitch('manifold-js');
    }
  });

  _langBtnScad = document.createElement('button');
  _langBtnScad.textContent = 'SCAD';
  _langBtnScad.addEventListener('click', () => {
    if (_currentLang !== 'scad') {
      callbacks.onLanguageSwitch('scad');
    }
  });

  syncLangToggle();
  langGroup.appendChild(_langBtnJs);
  langGroup.appendChild(_langBtnScad);
  toolbar.appendChild(langGroup);

  // Spacer
  const spacer = document.createElement('div');
  spacer.className = 'flex-1';
  toolbar.appendChild(spacer);

  // Example select
  const select = document.createElement('select');
  select.id = 'example-select';
  select.className = 'bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 cursor-pointer';

  const defaultOpt = document.createElement('option');
  defaultOpt.textContent = 'Load example\u2026';
  defaultOpt.value = '';
  select.appendChild(defaultOpt);

  for (const [name, entry] of Object.entries(examples)) {
    const opt = document.createElement('option');
    const displayName = name
      .replace(/^.*\//, '')
      .replace(/\.(js|scad)$/, '')
      .replace(/_/g, ' ');
    const tag = entry.language === 'scad' ? ' [SCAD]' : '';
    opt.textContent = displayName + tag;
    opt.value = name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const key = select.value;
    if (key && examples[key]) {
      callbacks.onExampleSelect(examples[key]);
      select.value = '';
    }
  });
  toolbar.appendChild(select);

  // Import button — file picker accepting .partwright.json / .js / .scad
  const btnImport = createButton('btn-import', '\u2191 Import');
  btnImport.title = 'Import a .partwright.json session, or a .js / .scad file';
  btnImport.classList.add('ml-2');

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = IMPORT_ACCEPT;
  importInput.className = 'hidden';
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (file) await callbacks.onImportFile(file);
    importInput.value = '';
  });

  btnImport.addEventListener('click', () => importInput.click());
  toolbar.appendChild(btnImport);
  toolbar.appendChild(importInput);

  // Export dropdown
  const exportWrapper = document.createElement('div');
  exportWrapper.className = 'relative ml-1';
  exportWrapper.id = 'export-wrapper';

  const btnExport = createButton('btn-export', '\u2193 Export');
  exportWrapper.appendChild(btnExport);

  const dropdown = document.createElement('div');
  dropdown.id = 'export-dropdown';
  dropdown.className = 'absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-1 hidden z-20 w-72 max-h-[80vh] overflow-y-auto';

  // Section: 3D model formats
  dropdown.appendChild(createSectionHeader('3D model'));

  const threemfOpt = createDescribedItem(
    '3MF',
    'Geometry + color. Native format for Bambu Studio multi-color prints.',
  );
  threemfOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExport3MF();
  });

  const objOpt = createDescribedItem(
    'OBJ',
    'Geometry + color via MTL. Extract ZIP before importing into slicer.',
  );
  objOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportOBJ();
  });

  const stlOpt = createDescribedItem(
    'STL',
    'Geometry only, no color. Universal slicer support.',
  );
  stlOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportSTL();
  });

  const glbOpt = createDescribedItem(
    'GLB',
    'Web/preview format with vertex colors. Not supported by slicers.',
  );
  glbOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportGLB();
  });

  dropdown.appendChild(threemfOpt);
  dropdown.appendChild(objOpt);
  dropdown.appendChild(stlOpt);
  dropdown.appendChild(glbOpt);

  // Section: project / source — for sharing between users or working with the code directly
  dropdown.appendChild(createDivider());
  dropdown.appendChild(createSectionHeader('Project'));

  const sessionOpt = createDescribedItem(
    'Session (.partwright.json)',
    'All versions, notes, and reference images. Another Partwright user can import this.',
  );
  sessionOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportSessionJSON();
  });

  const codeOpt = createDescribedItem(
    'Code (raw)',
    'Just the editor source as plain .js or .scad text.',
  );
  codeOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportRawCode();
  });

  dropdown.appendChild(sessionOpt);
  dropdown.appendChild(codeOpt);

  exportWrapper.appendChild(dropdown);

  btnExport.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!exportWrapper.contains(e.target as Node)) {
      dropdown.classList.add('hidden');
    }
  });

  toolbar.appendChild(exportWrapper);

  // Dark mode toggle — text button, on by default, off when clicked
  const themeBtn = document.createElement('button');
  themeBtn.id = 'btn-theme';
  themeBtn.textContent = 'Dark Mode';
  const themeActive = 'px-2 py-0.5 rounded text-xs font-medium transition-colors bg-zinc-700 text-zinc-100 ml-2';
  const themeInactive = 'px-2 py-0.5 rounded text-xs font-medium transition-colors text-zinc-500 hover:text-zinc-300 border border-zinc-600 ml-2';
  const syncThemeBtn = (theme: 'light' | 'dark') => {
    const on = theme === 'dark';
    themeBtn.className = on ? themeActive : themeInactive;
    themeBtn.title = on ? 'Dark mode on — click to switch to light' : 'Dark mode off — click to switch to dark';
    themeBtn.setAttribute('aria-pressed', String(on));
    themeBtn.setAttribute('aria-label', themeBtn.title);
  };
  syncThemeBtn(getTheme());
  themeBtn.addEventListener('click', () => { toggleTheme(); });
  onThemeChange(syncThemeBtn);
  toolbar.appendChild(themeBtn);

  // Help button
  const helpBtn = document.createElement('button');
  helpBtn.id = 'btn-help';
  helpBtn.className = 'flex items-center justify-center w-6 h-6 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs font-bold ml-2';
  helpBtn.textContent = '?';
  helpBtn.title = 'Help';
  helpBtn.addEventListener('click', () => {
    const record = window as unknown as Record<string, unknown>;
    const showHelp = (record.__partwrightShowHelp ?? record.__mainifoldShowHelp) as (() => void) | undefined;
    if (showHelp) showHelp();
  });
  toolbar.appendChild(helpBtn);

  // Tour re-entry button
  const tourBtn = document.createElement('button');
  tourBtn.id = 'btn-retake-tour';
  tourBtn.className = 'flex items-center justify-center w-6 h-6 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs ml-1';
  tourBtn.textContent = '\uD83C\uDFAF';
  tourBtn.title = 'Take the guided tour';
  tourBtn.addEventListener('click', () => {
    resetTour();
    startTour();
  });
  toolbar.appendChild(tourBtn);

  container.appendChild(toolbar);

  return toolbar;
}

function createButton(id: string, text: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors text-xs';
  btn.textContent = text;
  return btn;
}

function createDescribedItem(label: string, description: string, badge?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'block w-full text-left px-3 py-1.5 hover:bg-zinc-700 transition-colors';

  const top = document.createElement('div');
  top.className = 'flex items-center gap-1.5';

  const labelEl = document.createElement('span');
  labelEl.className = 'text-xs text-zinc-200 font-medium';
  labelEl.textContent = label;
  top.appendChild(labelEl);

  if (badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'text-[9px] uppercase tracking-wide text-emerald-400 border border-emerald-400/30 rounded px-1 py-px';
    badgeEl.textContent = badge;
    top.appendChild(badgeEl);
  }

  btn.appendChild(top);

  const descEl = document.createElement('div');
  descEl.className = 'text-[10px] text-zinc-500 leading-tight mt-0.5';
  descEl.textContent = description;
  btn.appendChild(descEl);

  return btn;
}

function createSectionHeader(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold';
  el.textContent = text;
  return el;
}

function createDivider(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'my-1 border-t border-zinc-700';
  return el;
}
