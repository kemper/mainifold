export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'partwright.theme';
const listeners = new Set<(theme: Theme) => void>();

let _current: Theme = readStoredTheme();

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.)
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function applyToDocument(theme: Theme): void {
  const html = document.documentElement;
  html.classList.toggle('dark', theme === 'dark');
  html.classList.toggle('theme-light', theme === 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#fafafa' : '#18181b');
}

export function getTheme(): Theme { return _current; }

export function setTheme(theme: Theme): void {
  if (_current === theme) return;
  _current = theme;
  applyToDocument(theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  for (const cb of listeners) cb(theme);
}

export function toggleTheme(): Theme {
  setTheme(_current === 'dark' ? 'light' : 'dark');
  return _current;
}

export function onThemeChange(cb: (theme: Theme) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Apply the persisted theme to the document. Call once on app start. */
export function initTheme(): void {
  applyToDocument(_current);
}
