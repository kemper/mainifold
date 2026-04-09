import { resetTour, startTour } from './tour';

export interface ToolbarCallbacks {
  onRun: () => void;
  onExportGLB: () => void;
  onExportSTL: () => void;
  onExportOBJ: () => void;
  onExport3MF: () => void;
  onExampleSelect: (code: string) => void;
}

let _autoRun = true;
let _onAutoRunChange: ((on: boolean) => void) | null = null;

/** Whether auto-run on edit is enabled */
export function isAutoRun(): boolean { return _autoRun; }

/** Register a callback for when auto-run state changes */
export function onAutoRunChange(cb: (on: boolean) => void): void { _onAutoRunChange = cb; }

export function createToolbar(
  container: HTMLElement,
  examples: Record<string, string>,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700 text-sm shrink-0';

  // Logo
  const logo = document.createElement('div');
  logo.className = 'flex items-center gap-2 mr-4';
  logo.innerHTML = `<svg width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="tg" x1="0" y1="0" x2="64" y2="64"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs>
    <circle cx="32" cy="32" r="26" fill="none" stroke="url(#tg)" stroke-width="2.5"/>
    <ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="#60a5fa" stroke-width="1.5" opacity="0.6"/>
    <ellipse cx="32" cy="24" rx="22" ry="6" fill="none" stroke="#60a5fa" stroke-width="1.2" opacity="0.4"/>
    <ellipse cx="32" cy="40" rx="22" ry="6" fill="none" stroke="#60a5fa" stroke-width="1.2" opacity="0.4"/>
    <ellipse cx="32" cy="32" rx="8" ry="26" fill="none" stroke="#60a5fa" stroke-width="1.5" opacity="0.6"/>
  </svg><span class="text-zinc-100 font-semibold">m<span class="text-blue-400">AI</span>nifold</span>`;
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

  for (const [name] of Object.entries(examples)) {
    const opt = document.createElement('option');
    const displayName = name
      .replace(/^.*\//, '')
      .replace(/\.js$/, '')
      .replace(/_/g, ' ');
    opt.textContent = displayName;
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

  // Export dropdown
  const exportWrapper = document.createElement('div');
  exportWrapper.className = 'relative ml-2';
  exportWrapper.id = 'export-wrapper';

  const btnExport = createButton('btn-export', '\u2193 Export');
  exportWrapper.appendChild(btnExport);

  const dropdown = document.createElement('div');
  dropdown.id = 'export-dropdown';
  dropdown.className = 'absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-1 hidden z-20 min-w-32';

  const glbOpt = createDropdownItem('GLB (recommended)');
  glbOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportGLB();
  });

  const stlOpt = createDropdownItem('STL');
  stlOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportSTL();
  });

  const objOpt = createDropdownItem('OBJ');
  objOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportOBJ();
  });

  const threemfOpt = createDropdownItem('3MF');
  threemfOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExport3MF();
  });

  dropdown.appendChild(glbOpt);
  dropdown.appendChild(stlOpt);
  dropdown.appendChild(objOpt);
  dropdown.appendChild(threemfOpt);
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

  // Help button
  const helpBtn = document.createElement('button');
  helpBtn.id = 'btn-help';
  helpBtn.className = 'flex items-center justify-center w-6 h-6 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs font-bold ml-2';
  helpBtn.textContent = '?';
  helpBtn.title = 'Help';
  helpBtn.addEventListener('click', () => {
    const showHelp = (window as unknown as Record<string, unknown>).__mainifoldShowHelp as (() => void) | undefined;
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

function createDropdownItem(text: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'block w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700';
  btn.textContent = text;
  return btn;
}
