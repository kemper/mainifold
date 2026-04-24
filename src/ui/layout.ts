export type TabName = 'interactive' | 'ai' | 'elevations' | 'gallery' | 'diff' | 'notes';

export interface LayoutElements {
  editorPane: HTMLElement;
  editorContainer: HTMLElement;
  viewportPane: HTMLElement;
  viewsContainer: HTMLElement;
  elevationsContainer: HTMLElement;
  galleryContainer: HTMLElement;
  diffContainer: HTMLElement;
  notesContainer: HTMLElement;
  statusBar: HTMLElement;
  clipControls: HTMLElement;
  switchTab: (tab: TabName, options?: SwitchTabOptions) => void;
}

export interface SwitchTabOptions {
  history?: 'push' | 'replace' | 'none';
}

export function createLayout(appContainer: HTMLElement): LayoutElements {
  const main = document.createElement('div');
  main.className = 'flex flex-1 min-h-0';

  // === Left: Editor pane ===
  const editorPane = document.createElement('div');
  editorPane.className = 'flex flex-col border-r border-zinc-700';
  editorPane.style.width = '35%';

  const editorHeader = document.createElement('div');
  editorHeader.className = 'flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700';

  const editorTitle = document.createElement('span');
  editorTitle.id = 'editor-title';
  editorTitle.className = 'text-xs text-zinc-400 font-mono';
  editorTitle.textContent = 'editor.js';
  editorHeader.appendChild(editorTitle);

  const statusBar = document.createElement('span');
  statusBar.id = 'status-indicator';
  statusBar.className = 'text-xs text-emerald-400 font-mono';
  statusBar.textContent = 'Ready';
  editorHeader.appendChild(statusBar);

  editorPane.appendChild(editorHeader);

  const editorContainer = document.createElement('div');
  editorContainer.id = 'editor-container';
  editorContainer.className = 'flex-1 min-h-0 overflow-hidden';
  editorPane.appendChild(editorContainer);

  // === Splitter ===
  const splitter = document.createElement('div');
  splitter.className = 'w-1 bg-zinc-700 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors';
  initSplitter(splitter, editorPane);

  // === Right: Tabbed viewport ===
  const rightPane = document.createElement('div');
  rightPane.className = 'flex-1 flex flex-col min-w-0';

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'flex items-center bg-zinc-800 border-b border-zinc-700 shrink-0';

  const tabInteractive = createTab('Interactive', true);
  tabInteractive.title = 'Live 3D viewport \u2014 orbit, zoom, and inspect';
  const tabAI = createTab('AI Views', false);
  tabAI.title = '4 isometric views for AI agent analysis';
  const tabElevations = createTab('Elevations', false);
  tabElevations.title = 'Orthographic views with optional reference image overlay';
  const tabGallery = createTab('Gallery', false);
  tabGallery.title = 'Compare saved versions side-by-side';
  const tabDiff = createTab('Diff', false);
  tabDiff.title = 'Compare code between two versions';
  const tabNotes = createTab('Notes', false);
  tabNotes.title = 'Session notes and design decisions log';

  // Copy / Download buttons (shown only on AI Views tab)
  const viewActions = document.createElement('div');
  viewActions.id = 'view-actions';
  viewActions.className = 'flex gap-2 ml-auto pr-3 hidden';

  const btnCopyViews = document.createElement('button');
  btnCopyViews.id = 'btn-copy-views';
  btnCopyViews.className = 'text-xs text-zinc-500 hover:text-zinc-300 transition-colors';
  btnCopyViews.textContent = 'Copy';
  viewActions.appendChild(btnCopyViews);

  const btnDownloadViews = document.createElement('button');
  btnDownloadViews.id = 'btn-download-views';
  btnDownloadViews.className = 'text-xs text-zinc-500 hover:text-zinc-300 transition-colors';
  btnDownloadViews.textContent = 'Download PNG';
  viewActions.appendChild(btnDownloadViews);

  tabBar.appendChild(tabInteractive);
  tabBar.appendChild(tabAI);
  tabBar.appendChild(tabElevations);
  tabBar.appendChild(tabGallery);
  tabBar.appendChild(tabDiff);
  tabBar.appendChild(tabNotes);
  tabBar.appendChild(viewActions);

  // Tab content panels
  const viewportPane = document.createElement('div');
  viewportPane.id = 'viewport-container';
  viewportPane.className = 'relative flex-1 min-h-0';

  // Clip controls overlay — positioned inside viewport
  const clipControls = createClipControls();
  viewportPane.appendChild(clipControls);

  const viewsContainer = document.createElement('div');
  viewsContainer.id = 'views-container';
  viewsContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-2';

  const elevationsContainer = document.createElement('div');
  elevationsContainer.id = 'elevations-container';
  elevationsContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-2';

  const galleryContainer = document.createElement('div');
  galleryContainer.id = 'gallery-container';
  galleryContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-4';

  const diffContainer = document.createElement('div');
  diffContainer.id = 'diff-container';
  diffContainer.className = 'flex-1 min-h-0 overflow-hidden bg-zinc-900 hidden';

  const notesContainer = document.createElement('div');
  notesContainer.id = 'notes-container';
  notesContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-4 flex flex-col';

  const allTabs = [tabInteractive, tabAI, tabElevations, tabGallery, tabDiff, tabNotes];
  const allPanes = [viewportPane, viewsContainer, elevationsContainer, galleryContainer, diffContainer, notesContainer];

  // Shared tab activation logic (DOM toggling, editor visibility, events)
  function applyTab(tab: TabName) {
    const idx = tab === 'interactive' ? 0 : tab === 'ai' ? 1 : tab === 'elevations' ? 2 : tab === 'gallery' ? 3 : tab === 'diff' ? 4 : 5;
    for (let i = 0; i < allPanes.length; i++) {
      if (i === idx) {
        allPanes[i].classList.remove('hidden');
        allTabs[i].className = 'px-4 py-1.5 text-xs font-medium text-zinc-100 border-b-2 border-blue-500 bg-zinc-900';
      } else {
        allPanes[i].classList.add('hidden');
        allTabs[i].className = 'px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent';
      }
    }
    viewActions.classList.toggle('hidden', tab !== 'ai' && tab !== 'elevations');
    const hideEditor = tab === 'ai' || tab === 'elevations' || tab === 'diff';
    editorPane.classList.toggle('hidden', hideEditor);
    splitter.classList.toggle('hidden', hideEditor);
    window.dispatchEvent(new CustomEvent('tab-switched', { detail: { tab } }));
    window.dispatchEvent(new Event('resize'));
  }

  // Tab switching — updates URL to reflect current tab
  function switchTab(tab: TabName, options: SwitchTabOptions = {}) {
    applyTab(tab);

    const basePath = '/editor';
    const params = new URLSearchParams(window.location.search);
    if (tab === 'ai') {
      params.set('view', 'ai');
      params.delete('gallery');
      params.delete('diff');
      params.delete('notes');
    } else if (tab === 'elevations') {
      params.set('view', 'elevations');
      params.delete('gallery');
      params.delete('diff');
      params.delete('notes');
    } else if (tab === 'gallery') {
      params.set('gallery', '');
      params.delete('view');
      params.delete('diff');
      params.delete('notes');
    } else if (tab === 'diff') {
      params.set('diff', '');
      params.delete('view');
      params.delete('gallery');
      params.delete('notes');
    } else if (tab === 'notes') {
      params.set('notes', '');
      params.delete('view');
      params.delete('gallery');
      params.delete('diff');
    } else {
      params.delete('view');
      params.delete('gallery');
      params.delete('diff');
      params.delete('notes');
    }
    const newUrl = params.toString()
      ? `${basePath}?${params.toString().replace(/=(?=&|$)/g, '')}`
      : basePath;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const historyMode = options.history ?? 'push';
    if (historyMode !== 'none' && newUrl !== currentUrl) {
      if (historyMode === 'replace') {
        window.history.replaceState(null, '', newUrl);
      } else {
        window.history.pushState(null, '', newUrl);
      }
    }
  }

  tabInteractive.addEventListener('click', () => switchTab('interactive'));
  tabAI.addEventListener('click', () => switchTab('ai'));
  tabElevations.addEventListener('click', () => switchTab('elevations'));
  tabGallery.addEventListener('click', () => switchTab('gallery'));
  tabDiff.addEventListener('click', () => switchTab('diff'));
  tabNotes.addEventListener('click', () => switchTab('notes'));

  // Restore tab from URL on initial load (without re-writing the URL)
  const initParams = new URLSearchParams(window.location.search);
  if (initParams.has('notes')) {
    applyTab('notes');
  } else if (initParams.has('diff')) {
    applyTab('diff');
  } else if (initParams.has('gallery')) {
    applyTab('gallery');
  } else if (initParams.get('view') === 'elevations') {
    applyTab('elevations');
  } else if (initParams.get('view') === 'ai') {
    applyTab('ai');
  }

  rightPane.appendChild(tabBar);
  rightPane.appendChild(viewportPane);
  rightPane.appendChild(viewsContainer);
  rightPane.appendChild(elevationsContainer);
  rightPane.appendChild(galleryContainer);
  rightPane.appendChild(diffContainer);
  rightPane.appendChild(notesContainer);

  main.appendChild(editorPane);
  main.appendChild(splitter);
  main.appendChild(rightPane);

  appContainer.appendChild(main);

  return { editorPane, editorContainer, viewportPane, viewsContainer, elevationsContainer, galleryContainer, diffContainer, notesContainer, statusBar, clipControls, switchTab };
}

function createTab(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = active
    ? 'px-4 py-1.5 text-xs font-medium text-zinc-100 border-b-2 border-blue-500 bg-zinc-900'
    : 'px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent';
  btn.textContent = label;
  btn.dataset.tab = label;
  return btn;
}

function createClipControls(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'clip-controls';
  container.className = 'absolute top-2 right-2 z-10 flex items-center gap-2';

  // Dimensions toggle (on by default)
  const dimBtn = document.createElement('button');
  dimBtn.id = 'dimensions-toggle';
  dimBtn.className = 'px-2 py-1 rounded text-xs bg-blue-500/20 backdrop-blur text-blue-400 hover:bg-blue-500/30 transition-colors border border-blue-500/30';
  dimBtn.textContent = '\uD83D\uDCCF';
  dimBtn.title = 'Toggle bounding box dimensions';
  container.appendChild(dimBtn);

  // Orbit lock toggle
  const lockBtn = document.createElement('button');
  lockBtn.id = 'orbit-lock-toggle';
  lockBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  lockBtn.textContent = '\uD83D\uDD13';
  lockBtn.title = 'Lock camera rotation';
  container.appendChild(lockBtn);

  // Measure toggle button
  const measureBtn = document.createElement('button');
  measureBtn.id = 'measure-toggle';
  measureBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  measureBtn.textContent = '\uD83D\uDCCF Measure';
  measureBtn.title = 'Measure distance between two points on your model';
  container.appendChild(measureBtn);

  // Clip toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'clip-toggle';
  toggleBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  toggleBtn.textContent = '\u2702 Cross Section';
  toggleBtn.title = 'Toggle cross-section clipping plane';
  container.appendChild(toggleBtn);

  // Slider + Z value (hidden until clip is active)
  const sliderGroup = document.createElement('div');
  sliderGroup.id = 'clip-slider-group';
  sliderGroup.className = 'hidden flex items-center gap-2 px-2 py-1 rounded bg-zinc-800/80 backdrop-blur border border-zinc-600/50';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'clip-z-slider';
  slider.className = 'w-28 accent-red-400';
  slider.min = '0';
  slider.max = '10';
  slider.step = '0.01';
  slider.value = '5';
  sliderGroup.appendChild(slider);

  const zLabel = document.createElement('span');
  zLabel.id = 'clip-z-label';
  zLabel.className = 'text-xs text-zinc-300 font-mono w-16 text-right';
  zLabel.textContent = 'Z: 5.00';
  sliderGroup.appendChild(zLabel);

  container.appendChild(sliderGroup);

  return container;
}

function initSplitter(splitter: HTMLElement, editorPane: HTMLElement) {
  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (e: MouseEvent) => {
    const newWidth = startWidth + (e.clientX - startX);
    const minW = 200;
    const maxW = window.innerWidth - 200;
    editorPane.style.width = `${Math.max(minW, Math.min(maxW, newWidth))}px`;
    window.dispatchEvent(new Event('resize'));
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = editorPane.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
