// Right-side floating chat drawer. The single largest UI surface of the AI
// feature — owns the transcript view, the cost-control toggle strip, the
// input row, the cost meter, and the compact button. State lives in the
// ai/* modules; this file is mostly DOM wiring.

import { runTurn, totalCost, totalTokensEstimate, estimateCachedPrefixTokens } from '../ai/chatLoop';
import { listMessages, GLOBAL_CHAT_BUCKET, putMessages, deleteMessages, getKey } from '../ai/db';
import { proposeCompaction } from '../ai/compaction';
import { captureIsoViews, fileToImageSource } from '../ai/images';
import { loadSettings, saveSettings, applyPreset, setModel, setToggles, MODEL_OPTIONS, PRESET_OPTIONS, type AiSettings } from '../ai/settings';
import { buildSystemPrompt, loadAiMd } from '../ai/systemPrompt';
import { estimateTurnCostUsd, formatUsd } from '../ai/cost';
import { generateId } from '../storage/db';
import { showAiKeyModal } from './aiKeyModal';
import { showAiSettingsModal } from './aiSettingsModal';
import { showCompactConfirmModal } from './aiCompactModal';
import type { ChatBlock, ChatMessage, ImageSource, ModelId, PersistedToolResult } from '../ai/types';

interface PanelState {
  open: boolean;
  sessionId: string;
  history: ChatMessage[];
  pendingImages: ImageSource[];
  systemPromptChars: number;
  inFlight: boolean;
}

const state: PanelState = {
  open: false,
  sessionId: GLOBAL_CHAT_BUCKET,
  history: [],
  pendingImages: [],
  systemPromptChars: 0,
  inFlight: false,
};

let drawerEl: HTMLElement | null = null;
let transcriptEl: HTMLElement | null = null;
let inputEl: HTMLTextAreaElement | null = null;
let pendingImagesEl: HTMLElement | null = null;
let toggleStripEl: HTMLElement | null = null;
let costMeterEl: HTMLElement | null = null;
let panelStatusEl: HTMLElement | null = null;

let onPanelStateChange: ((open: boolean) => void) | null = null;

/** Mount the drawer once on app start. Idempotent. */
export async function initAiPanel(): Promise<void> {
  if (drawerEl) return;
  // Pre-load ai.md so the first turn doesn't pay the fetch latency on top
  // of the API round trip. Also seeds the systemPromptChars estimate.
  const aiMd = await loadAiMd();
  state.systemPromptChars = buildSystemPrompt(aiMd).length;

  const settings = loadSettings();
  state.open = settings.drawerOpen;

  buildDrawer();
  // Don't try to load history until a session is opened or we know we're
  // in the global bucket. main.ts will call setActiveSession when ready.
  await loadHistoryForCurrentSession();
  if (state.open) showDrawer();
  else hideDrawer();
}

/** Called by main.ts whenever the active session changes (open / close). */
export async function setActiveSession(sessionId: string | null): Promise<void> {
  state.sessionId = sessionId ?? GLOBAL_CHAT_BUCKET;
  await loadHistoryForCurrentSession();
  renderTranscript();
  renderCostMeter();
}

export function toggleAiPanel(): void {
  if (state.open) hideDrawer();
  else showDrawer();
}

export function isAiPanelOpen(): boolean {
  return state.open;
}

export function onAiPanelStateChange(fn: (open: boolean) => void): void {
  onPanelStateChange = fn;
}

function showDrawer(): void {
  if (!drawerEl) return;
  state.open = true;
  drawerEl.classList.remove('translate-x-full');
  drawerEl.classList.add('translate-x-0');
  saveSettings({ ...loadSettings(), drawerOpen: true });
  onPanelStateChange?.(true);
  inputEl?.focus();
}

function hideDrawer(): void {
  if (!drawerEl) return;
  state.open = false;
  drawerEl.classList.remove('translate-x-0');
  drawerEl.classList.add('translate-x-full');
  saveSettings({ ...loadSettings(), drawerOpen: false });
  onPanelStateChange?.(false);
}

async function loadHistoryForCurrentSession(): Promise<void> {
  state.history = await listMessages(state.sessionId);
}

// === DOM construction ===

function buildDrawer(): void {
  const root = document.createElement('div');
  root.id = 'ai-panel';
  root.className = 'fixed top-0 right-0 h-screen w-[420px] bg-zinc-900 border-l border-zinc-700 shadow-2xl z-40 flex flex-col transition-transform duration-200 translate-x-full';
  drawerEl = root;

  // Header — title, model picker, preset picker, close
  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 px-3 py-2 border-b border-zinc-700 shrink-0';

  const titleEl = document.createElement('div');
  titleEl.className = 'text-sm font-semibold text-zinc-100 mr-1';
  titleEl.textContent = 'AI';
  header.appendChild(titleEl);

  const modelSelect = createModelSelect();
  header.appendChild(modelSelect);

  const presetSelect = createPresetSelect();
  header.appendChild(presetSelect);

  const compactBtn = createIconButton('Compact', '⤓ Compact');
  compactBtn.title = 'Compact the conversation: summarize older turns and promote insights to session notes.';
  compactBtn.addEventListener('click', () => { void runCompact(); });
  header.appendChild(compactBtn);

  const settingsBtn = createIconButton('Settings', '⚙');
  settingsBtn.title = 'AI settings: provider, key, lifetime usage.';
  settingsBtn.addEventListener('click', () => {
    void showAiSettingsModal({ onChange: () => { renderTranscript(); renderToggleStrip(); renderCostMeter(); panelStatusUpdate(); } });
  });
  header.appendChild(settingsBtn);

  const spacer = document.createElement('div');
  spacer.className = 'flex-1';
  header.appendChild(spacer);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-sm';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', hideDrawer);
  header.appendChild(closeBtn);

  root.appendChild(header);

  // Status bar — surfaces "no key" / "ready" / errors
  panelStatusEl = document.createElement('div');
  panelStatusEl.className = 'px-3 py-1.5 text-[11px] border-b border-zinc-800 hidden';
  root.appendChild(panelStatusEl);

  // Transcript
  transcriptEl = document.createElement('div');
  transcriptEl.className = 'flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3';
  root.appendChild(transcriptEl);

  // Toggle strip
  toggleStripEl = document.createElement('div');
  toggleStripEl.className = 'px-3 py-1.5 border-t border-zinc-800 flex flex-wrap items-center gap-1.5 shrink-0';
  root.appendChild(toggleStripEl);

  // Cost meter
  costMeterEl = document.createElement('div');
  costMeterEl.className = 'px-3 pb-1.5 text-[10px] text-zinc-500 flex items-center gap-2 shrink-0';
  root.appendChild(costMeterEl);

  // Pending image attachments row (hidden until something is pending)
  pendingImagesEl = document.createElement('div');
  pendingImagesEl.className = 'px-3 pb-1.5 flex flex-wrap gap-1.5 shrink-0 hidden';
  root.appendChild(pendingImagesEl);

  // Input row
  const inputRow = document.createElement('div');
  inputRow.className = 'px-3 py-2 border-t border-zinc-700 flex items-end gap-2 shrink-0';

  const showAiBtn = document.createElement('button');
  showAiBtn.className = 'shrink-0 px-2 py-1 rounded text-[11px] text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700';
  showAiBtn.textContent = '📷 Show AI';
  showAiBtn.title = 'Snapshot the 4 iso views and attach to your next message.';
  showAiBtn.addEventListener('click', () => { void attachIsoViews(); });
  inputRow.appendChild(showAiBtn);

  const fileBtn = document.createElement('button');
  fileBtn.className = 'shrink-0 px-2 py-1 rounded text-[11px] text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700';
  fileBtn.textContent = '📎';
  fileBtn.title = 'Attach an image from disk.';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', async () => {
    if (!fileInput.files) return;
    for (const file of Array.from(fileInput.files)) await attachFile(file);
    fileInput.value = '';
  });
  fileBtn.addEventListener('click', () => fileInput.click());
  inputRow.appendChild(fileBtn);
  inputRow.appendChild(fileInput);

  const ta = document.createElement('textarea');
  ta.placeholder = 'Ask the AI to model something...';
  ta.rows = 2;
  ta.className = 'flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 resize-none';
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });
  ta.addEventListener('paste', e => {
    if (!e.clipboardData) return;
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void attachFile(file);
        }
      }
    }
  });
  inputEl = ta;
  inputRow.appendChild(ta);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'shrink-0 px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed';
  sendBtn.textContent = 'Send';
  sendBtn.addEventListener('click', () => { void sendMessage(); });
  inputRow.appendChild(sendBtn);

  root.appendChild(inputRow);

  // Drag-drop image handling
  root.addEventListener('dragover', e => { e.preventDefault(); root.classList.add('ring-2', 'ring-blue-500'); });
  root.addEventListener('dragleave', e => { if (e.target === root) root.classList.remove('ring-2', 'ring-blue-500'); });
  root.addEventListener('drop', async e => {
    e.preventDefault();
    root.classList.remove('ring-2', 'ring-blue-500');
    if (!e.dataTransfer) return;
    for (const file of Array.from(e.dataTransfer.files)) await attachFile(file);
  });

  document.body.appendChild(root);

  renderToggleStrip();
  renderCostMeter();
  renderTranscript();
  panelStatusUpdate();
}

function createIconButton(_label: string, glyph: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'px-2 py-1 rounded text-[11px] text-zinc-300 hover:bg-zinc-800 border border-transparent hover:border-zinc-700';
  btn.textContent = glyph;
  return btn;
}

function createModelSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'px-2 py-1 rounded text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none';
  for (const opt of MODEL_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    sel.appendChild(o);
  }
  sel.value = loadSettings().toggles.model;
  sel.addEventListener('change', () => {
    saveSettings(setModel(loadSettings(), sel.value as ModelId));
    renderToggleStrip();
    renderCostMeter();
  });
  return sel;
}

function createPresetSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'px-2 py-1 rounded text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none';
  for (const opt of PRESET_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    o.title = opt.hint;
    sel.appendChild(o);
  }
  sel.value = loadSettings().preset;
  sel.addEventListener('change', () => {
    const next = applyPreset(loadSettings(), sel.value as AiSettings['preset']);
    saveSettings(next);
    // Sync the model picker too
    const modelSelect = drawerEl?.querySelector('select') as HTMLSelectElement | null;
    if (modelSelect) modelSelect.value = next.toggles.model;
    renderToggleStrip();
    renderCostMeter();
  });
  return sel;
}

// === Toggle strip rendering ===

function renderToggleStrip(): void {
  if (!toggleStripEl) return;
  toggleStripEl.replaceChildren();
  const settings = loadSettings();
  const { toggles } = settings;

  toggleStripEl.appendChild(togglePill('👁 Views', toggles.vision.views, () => {
    saveSettings(setToggles(loadSettings(), { vision: { views: !toggles.vision.views } }));
    renderToggleStrip();
    renderCostMeter();
  }));
  toggleStripEl.appendChild(togglePill('▶ Run', toggles.scope.runCode, () => {
    saveSettings(setToggles(loadSettings(), { scope: { runCode: !toggles.scope.runCode } }));
    renderToggleStrip();
  }));
  toggleStripEl.appendChild(togglePill('💾 Save', toggles.scope.saveVersions, () => {
    saveSettings(setToggles(loadSettings(), { scope: { saveVersions: !toggles.scope.saveVersions } }));
    renderToggleStrip();
  }));
  toggleStripEl.appendChild(togglePill('🎨 Paint', toggles.scope.paintFaces, () => {
    saveSettings(setToggles(loadSettings(), { scope: { paintFaces: !toggles.scope.paintFaces } }));
    renderToggleStrip();
  }));

  const retry = document.createElement('select');
  retry.className = 'px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none';
  retry.title = 'Auto-retry on tool error: how many times to feed the error back before surfacing it.';
  for (const n of [0, 1, 3]) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `↻ ${n}`;
    retry.appendChild(opt);
  }
  retry.value = String(toggles.autoRetry);
  retry.addEventListener('change', () => {
    saveSettings(setToggles(loadSettings(), { autoRetry: Number(retry.value) as 0 | 1 | 3 }));
  });
  toggleStripEl.appendChild(retry);
}

function togglePill(label: string, on: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = on
    ? 'px-2 py-0.5 rounded text-[10px] bg-emerald-700/40 border border-emerald-700/60 text-emerald-200'
    : 'px-2 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-500';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

// === Cost meter ===

function renderCostMeter(): void {
  if (!costMeterEl) return;
  const settings = loadSettings();
  const tokens = totalTokensEstimate(state.history, state.systemPromptChars);
  const cost = totalCost(state.history);
  const cachedPrefix = estimateCachedPrefixTokens(state.systemPromptChars);
  const turnEst = estimateTurnCostUsd(settings.toggles.model, cachedPrefix, 500 + (settings.toggles.vision.views ? 6000 : 0));

  // Color the context bar by % of model context window
  const ctxLimit = settings.toggles.model === 'claude-haiku-4-5' ? 200_000 : 1_000_000;
  const pct = Math.min(100, Math.round((tokens / ctxLimit) * 100));
  const barColor = pct < 60 ? 'bg-emerald-500' : pct < 85 ? 'bg-amber-500' : 'bg-red-500';

  costMeterEl.replaceChildren();
  const meter = document.createElement('div');
  meter.className = 'flex items-center gap-1.5';
  meter.innerHTML = `
    <span>ctx</span>
    <span class="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden inline-block">
      <span class="block h-full ${barColor}" style="width: ${pct}%"></span>
    </span>
    <span class="text-zinc-400">${pct}%</span>
  `;
  costMeterEl.appendChild(meter);

  const sep = document.createElement('span');
  sep.className = 'text-zinc-700';
  sep.textContent = '·';
  costMeterEl.appendChild(sep);

  const session = document.createElement('span');
  session.textContent = `session: ${formatUsd(cost)}`;
  costMeterEl.appendChild(session);

  const sep2 = document.createElement('span');
  sep2.className = 'text-zinc-700';
  sep2.textContent = '·';
  costMeterEl.appendChild(sep2);

  const next = document.createElement('span');
  next.textContent = `next turn ~${formatUsd(turnEst)}`;
  costMeterEl.appendChild(next);
}

// === Status bar ===

function panelStatusUpdate(): void {
  if (!panelStatusEl) return;
  void getKey('anthropic').then(key => {
    if (!panelStatusEl) return;
    if (!key) {
      panelStatusEl.classList.remove('hidden', 'text-emerald-400');
      panelStatusEl.classList.add('text-amber-400');
      panelStatusEl.replaceChildren();
      const text = document.createTextNode('Not connected. ');
      panelStatusEl.appendChild(text);
      const link = document.createElement('button');
      link.className = 'underline text-amber-200 hover:text-amber-100';
      link.textContent = 'Connect Anthropic API';
      link.addEventListener('click', () => {
        void showAiKeyModal({ onConnected: () => { panelStatusUpdate(); } });
      });
      panelStatusEl.appendChild(link);
    } else {
      panelStatusEl.classList.add('hidden');
    }
  });
}

// === Transcript rendering ===

function renderTranscript(): void {
  if (!transcriptEl) return;
  transcriptEl.replaceChildren();
  if (state.history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'flex-1 flex items-center justify-center text-zinc-600 text-xs text-center px-6';
    empty.textContent = state.sessionId === GLOBAL_CHAT_BUCKET
      ? 'Open a session and ask the AI to model something. Try: "Build a coffee mug, 80mm tall."'
      : 'Ask the AI to model, modify, or describe this session.';
    transcriptEl.appendChild(empty);
    return;
  }
  for (const msg of state.history) {
    transcriptEl.appendChild(renderMessage(msg));
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function renderMessage(msg: ChatMessage): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = msg.role === 'user' ? 'flex flex-col items-end gap-1' : 'flex flex-col items-start gap-1';
  wrap.dataset.messageId = msg.id;

  // Tool results (user role) get rendered as collapsed bubbles
  if (msg.role === 'user' && msg.toolResults && msg.toolResults.length > 0) {
    for (const tr of msg.toolResults) {
      wrap.appendChild(renderToolResultBubble(tr));
    }
  }

  for (const b of msg.blocks) {
    if (b.type === 'text' && b.text.trim().length > 0) {
      wrap.appendChild(renderTextBubble(msg.role, b.text, msg.compacted));
    } else if (b.type === 'image') {
      wrap.appendChild(renderImageBubble(b.source));
    }
  }

  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    for (const tc of msg.toolCalls) {
      wrap.appendChild(renderToolCallChip(tc.name, tc.input));
    }
  }

  if (msg.role === 'assistant' && msg.costUsd !== undefined) {
    const meta = document.createElement('div');
    meta.className = 'text-[10px] text-zinc-600';
    meta.textContent = `${formatUsd(msg.costUsd)}${msg.usage ? ` · ${msg.usage.outputTokens}t out` : ''}`;
    wrap.appendChild(meta);
  }

  return wrap;
}

function renderTextBubble(role: 'user' | 'assistant', text: string, compacted?: boolean): HTMLElement {
  const bubble = document.createElement('div');
  const baseClass = 'max-w-[90%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap leading-snug';
  if (compacted) {
    bubble.className = `${baseClass} bg-zinc-800/60 border border-zinc-700 text-zinc-300 italic`;
  } else if (role === 'user') {
    bubble.className = `${baseClass} bg-blue-600 text-white`;
  } else {
    bubble.className = `${baseClass} bg-zinc-800 text-zinc-100`;
  }
  bubble.textContent = text;
  return bubble;
}

function renderImageBubble(source: ImageSource): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'max-w-[90%] rounded-lg overflow-hidden border border-zinc-700';
  const img = document.createElement('img');
  img.src = `data:${source.mediaType};base64,${source.data}`;
  img.alt = source.label ?? 'image';
  img.className = 'block max-w-full max-h-64';
  wrap.appendChild(img);
  if (source.label) {
    const label = document.createElement('div');
    label.className = 'px-2 py-1 text-[10px] text-zinc-400 bg-zinc-800';
    label.textContent = source.label;
    wrap.appendChild(label);
  }
  return wrap;
}

function renderToolCallChip(name: string, input: Record<string, unknown>): HTMLElement {
  const chip = document.createElement('details');
  chip.className = 'max-w-[90%] text-[11px] rounded border border-zinc-700 bg-zinc-800/40 px-2 py-1';
  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer text-zinc-300 select-none';
  summary.textContent = `◆ ${name}(…)`;
  chip.appendChild(summary);
  const pre = document.createElement('pre');
  pre.className = 'mt-1 text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap';
  pre.textContent = JSON.stringify(input, null, 2);
  chip.appendChild(pre);
  return chip;
}

function renderToolResultBubble(result: PersistedToolResult): HTMLElement {
  const chip = document.createElement('details');
  const tone = result.isError ? 'border-red-700/60 bg-red-900/20 text-red-200' : 'border-emerald-700/40 bg-emerald-900/10 text-emerald-200';
  chip.className = `max-w-[90%] text-[11px] rounded border ${tone} px-2 py-1`;
  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer select-none';
  const head = result.content.split('\n')[0].slice(0, 80);
  summary.textContent = `${result.isError ? '✗' : '✓'} ${head}${result.content.length > head.length ? '…' : ''}`;
  chip.appendChild(summary);
  const pre = document.createElement('pre');
  pre.className = 'mt-1 text-[10px] opacity-80 overflow-x-auto whitespace-pre-wrap';
  pre.textContent = result.content;
  chip.appendChild(pre);
  return chip;
}

// === Pending images ===

async function attachIsoViews(): Promise<void> {
  const img = await captureIsoViews();
  if (!img) {
    setTransientStatus('No geometry to snapshot — run some code first.');
    return;
  }
  state.pendingImages.push(img);
  renderPendingImages();
}

async function attachFile(file: File): Promise<void> {
  const img = await fileToImageSource(file);
  if (!img) {
    setTransientStatus(`Skipped non-image: ${file.name}`);
    return;
  }
  state.pendingImages.push(img);
  renderPendingImages();
}

function renderPendingImages(): void {
  if (!pendingImagesEl) return;
  pendingImagesEl.replaceChildren();
  if (state.pendingImages.length === 0) {
    pendingImagesEl.classList.add('hidden');
    return;
  }
  pendingImagesEl.classList.remove('hidden');
  state.pendingImages.forEach((img, i) => {
    const chip = document.createElement('div');
    chip.className = 'relative w-12 h-12 rounded border border-zinc-600 overflow-hidden';
    const el = document.createElement('img');
    el.src = `data:${img.mediaType};base64,${img.data}`;
    el.className = 'w-full h-full object-cover';
    chip.appendChild(el);
    const rm = document.createElement('button');
    rm.className = 'absolute top-0 right-0 w-4 h-4 bg-black/70 text-white text-[10px] rounded-bl';
    rm.textContent = '✕';
    rm.title = `Remove ${img.label ?? 'image'}`;
    rm.addEventListener('click', () => {
      state.pendingImages.splice(i, 1);
      renderPendingImages();
    });
    chip.appendChild(rm);
    pendingImagesEl!.appendChild(chip);
  });
}

// === Send message ===

async function sendMessage(): Promise<void> {
  if (state.inFlight) return;
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (text.length === 0 && state.pendingImages.length === 0) return;

  const key = await getKey('anthropic');
  if (!key) {
    void showAiKeyModal({ onConnected: () => { panelStatusUpdate(); void sendMessage(); } });
    return;
  }

  const settings = loadSettings();
  const blocks: ChatBlock[] = [];
  if (text.length > 0) blocks.push({ type: 'text', text });
  // Only attach images the user added if vision is on. Iso views are
  // user-initiated via Show AI; pending images get sent regardless because
  // the user's intent is explicit when they attached them.
  for (const img of state.pendingImages) blocks.push({ type: 'image', source: img });

  inputEl.value = '';
  state.pendingImages = [];
  renderPendingImages();
  state.inFlight = true;

  let activeAssistantId: string | null = null;
  let liveTextEl: HTMLElement | null = null;

  await runTurn({
    apiKey: key.apiKey,
    toggles: settings.toggles,
    sessionId: state.sessionId,
    history: state.history,
    userBlocks: blocks,
  }, {
    onUserPersisted: msg => {
      state.history.push(msg);
      renderTranscript();
    },
    onAssistantStart: id => {
      activeAssistantId = id;
      const placeholder: ChatMessage = {
        id, sessionId: state.sessionId, role: 'assistant',
        blocks: [{ type: 'text', text: '' }], createdAt: Date.now(),
        seq: (state.history[state.history.length - 1]?.seq ?? 0) + 1,
      };
      state.history.push(placeholder);
      renderTranscript();
      // Grab the just-rendered bubble's text element so we can append deltas
      if (transcriptEl) {
        const wrap = transcriptEl.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
        liveTextEl = wrap?.querySelector('.bg-zinc-800') as HTMLElement | null;
        if (liveTextEl) liveTextEl.textContent = '';
      }
    },
    onAssistantText: delta => {
      if (liveTextEl) {
        liveTextEl.textContent = (liveTextEl.textContent ?? '') + delta;
        if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }
    },
    onAssistantPersisted: msg => {
      // Replace the placeholder with the persisted message
      const idx = state.history.findIndex(m => m.id === activeAssistantId);
      if (idx >= 0) state.history[idx] = msg;
      activeAssistantId = null;
      liveTextEl = null;
      renderTranscript();
      renderCostMeter();
    },
    onToolResult: (_id, _name, result) => {
      // The user-message that carries the tool result will be rendered when
      // the loop persists it; nothing to do here in v0 beyond a flash
      // notification for errors.
      if (result.isError) setTransientStatus('A tool errored. The agent will retry or surface the issue.');
    },
    onError: err => {
      setTransientStatus(`Error: ${err.message}`);
    },
    onTurnComplete: () => {
      // Refresh from DB to catch any tool-result messages
      void loadHistoryForCurrentSession().then(() => {
        renderTranscript();
        renderCostMeter();
      });
    },
  });

  state.inFlight = false;
}

// === Compaction ===

async function runCompact(): Promise<void> {
  if (state.inFlight) {
    setTransientStatus('Wait for the current turn to finish before compacting.');
    return;
  }
  const key = await getKey('anthropic');
  if (!key) {
    void showAiKeyModal({ onConnected: () => panelStatusUpdate() });
    return;
  }
  setTransientStatus('Asking Haiku to summarize...');
  let proposal;
  try {
    proposal = await proposeCompaction(key.apiKey, state.history);
  } catch (err) {
    setTransientStatus(`Compaction failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  setTransientStatus('');

  showCompactConfirmModal(proposal, async ({ summary, notes }) => {
    // Promote selected notes to durable session log via the existing API
    const w = window as unknown as { partwright?: { addSessionNote?: (t: string) => Promise<unknown> } };
    if (w.partwright?.addSessionNote && state.sessionId !== GLOBAL_CHAT_BUCKET) {
      for (const note of notes) {
        try { await w.partwright.addSessionNote(note); } catch { /* noop */ }
      }
    }
    // Replace the dropped tail with one synthetic summary message
    const summaryMsg: ChatMessage = {
      id: generateId(),
      sessionId: state.sessionId,
      role: 'assistant',
      blocks: [{ type: 'text', text: `[compacted summary]\n${summary}` }],
      createdAt: Date.now(),
      seq: -1, // sorts before everything kept
      compacted: true,
    };
    await deleteMessages(proposal.drop.map(m => m.id));
    await putMessages([summaryMsg]);
    await loadHistoryForCurrentSession();
    renderTranscript();
    renderCostMeter();
    setTransientStatus(`Compacted ${proposal.drop.length} turn(s); promoted ${notes.length} note(s).`);
  });
}

// === Status flash ===

let statusTimer: number | null = null;

function setTransientStatus(text: string): void {
  if (!panelStatusEl) return;
  if (statusTimer !== null) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (!text) {
    panelStatusUpdate();
    return;
  }
  panelStatusEl.classList.remove('hidden', 'text-amber-400');
  panelStatusEl.classList.add('text-blue-300');
  panelStatusEl.textContent = text;
  statusTimer = window.setTimeout(() => {
    statusTimer = null;
    panelStatusUpdate();
  }, 4000);
}
