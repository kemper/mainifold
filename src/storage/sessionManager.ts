// Session manager — coordinates between storage, UI, and URL state

import {
  createSession as dbCreateSession,
  getSession,
  listSessions as dbListSessions,
  deleteSession as dbDeleteSession,
  saveVersion as dbSaveVersion,
  listVersions as dbListVersions,
  getLatestVersion,
  getVersionByIndex,
  getVersionById,
  getVersionCount,
  clearAllData,
  updateSession as dbUpdateSession,
  addNote as dbAddNote,
  listNotes as dbListNotes,
  deleteNote as dbDeleteNote,
  updateNote as dbUpdateNote,
  type Session,
  type Version,
  type SessionNote,
  type ReferenceImagesData,
} from './db';

export interface ExportedSession {
  partwright?: string;
  mainifold?: string;
  session: { name: string; created: number; updated: number; referenceImages?: ReferenceImagesData | null; language?: 'manifold-js' | 'scad' };
  versions: {
    index: number;
    code: string;
    label: string;
    geometryData: Record<string, unknown> | null;
    timestamp: number;
    notes?: string;
  }[];
  notes?: { text: string; timestamp: number }[];
}

export type { Session, Version, SessionNote, ReferenceImagesData } from './db';

export interface SessionState {
  session: Session | null;
  currentVersion: Version | null;
  versionCount: number;
}

type StateChangeListener = (state: SessionState) => void;

let currentState: SessionState = {
  session: null,
  currentVersion: null,
  versionCount: 0,
};

const listeners: StateChangeListener[] = [];

function notify() {
  for (const fn of listeners) fn(currentState);
  window.dispatchEvent(new CustomEvent('session-changed', { detail: currentState }));
}

export function onStateChange(fn: StateChangeListener): void {
  listeners.push(fn);
}

export function getState(): SessionState {
  return currentState;
}

// === URL helpers ===

function updateURL() {
  const params = new URLSearchParams(window.location.search);
  const basePath = '/editor';
  if (currentState.session) {
    params.set('session', currentState.session.id);
    if (currentState.currentVersion) {
      params.set('v', String(currentState.currentVersion.index));
    } else {
      params.delete('v');
    }
  } else {
    params.delete('session');
    params.delete('v');
  }
  const qs = params.toString().replace(/=(?=&|$)/g, '');
  const newUrl = qs
    ? `${basePath}?${qs}`
    : basePath;
  window.history.replaceState(null, '', newUrl);
}

export function getSessionIdFromURL(): string | null {
  return new URLSearchParams(window.location.search).get('session');
}

export function getVersionFromURL(): number | null {
  const v = new URLSearchParams(window.location.search).get('v');
  return v ? parseInt(v, 10) : null;
}

// === Session operations ===

export async function createSession(name?: string, language?: 'manifold-js' | 'scad'): Promise<Session> {
  // Clean up the previous session if it was empty
  if (currentState.session) {
    await deleteIfEmpty(currentState.session.id);
  }
  const session = await dbCreateSession(name, language);
  currentState = { session, currentVersion: null, versionCount: 0 };
  updateURL();
  notify();
  return session;
}

export async function openSession(id: string, versionIndex?: number): Promise<Version | null> {
  // Clean up the previous session if it was empty (no versions, no notes)
  if (currentState.session && currentState.session.id !== id) {
    await deleteIfEmpty(currentState.session.id);
  }

  const session = await getSession(id);
  if (!session) return null;

  const count = await getVersionCount(id);
  let version: Version | null = null;

  if (versionIndex !== undefined) {
    version = await getVersionByIndex(id, versionIndex);
  }
  if (!version) {
    version = await getLatestVersion(id);
  }

  currentState = { session, currentVersion: version, versionCount: count };
  updateURL();
  notify();
  return version;
}

export async function closeSession(): Promise<void> {
  // Clean up the session we're closing if it was empty
  if (currentState.session) {
    await deleteIfEmpty(currentState.session.id);
  }
  currentState = { session: null, currentVersion: null, versionCount: 0 };
  updateURL();
  notify();
}

export async function listSessions(): Promise<Session[]> {
  return dbListSessions();
}

export async function deleteSession(id: string): Promise<void> {
  await dbDeleteSession(id);
  if (currentState.session?.id === id) {
    await closeSession();
  }
}

export async function renameSession(id: string, newName: string): Promise<void> {
  await dbUpdateSession(id, { name: newName, updated: Date.now() });
  if (currentState.session?.id === id) {
    currentState.session = { ...currentState.session, name: newName, updated: Date.now() };
    notify();
  }
}

export async function setSessionLanguage(id: string, language: 'manifold-js' | 'scad'): Promise<void> {
  await dbUpdateSession(id, { language, updated: Date.now() });
  if (currentState.session?.id === id) {
    currentState.session = { ...currentState.session, language, updated: Date.now() };
    notify();
  }
}

// === Version operations ===

export async function saveVersion(
  code: string,
  geometryData: Record<string, unknown> | null,
  thumbnail: Blob | null,
  label?: string,
  notes?: string,
  options?: { force?: boolean },
): Promise<Version | null> {
  if (!currentState.session) return null;

  // Skip if code is identical to the current version (unless forced)
  if (!options?.force && currentState.currentVersion && currentState.currentVersion.code === code) {
    return null;
  }

  const version = await dbSaveVersion(
    currentState.session.id,
    code,
    geometryData,
    thumbnail,
    label,
    notes,
  );

  currentState = {
    ...currentState,
    currentVersion: version,
    versionCount: currentState.versionCount + 1,
  };
  updateURL();
  notify();
  return version;
}

export async function navigateVersion(direction: 'prev' | 'next'): Promise<Version | null> {
  if (!currentState.session || !currentState.currentVersion) return null;

  const targetIndex = currentState.currentVersion.index + (direction === 'prev' ? -1 : 1);
  if (targetIndex < 1 || targetIndex > currentState.versionCount) return null;

  const version = await getVersionByIndex(currentState.session.id, targetIndex);
  if (!version) return null;

  currentState = { ...currentState, currentVersion: version };
  updateURL();
  notify();
  return version;
}

/** Look up a version by index (number) or id (string) without mutating current state. */
export async function peekVersion(target: number | string): Promise<Version | null> {
  if (!currentState.session) return null;
  if (typeof target === 'number') {
    return getVersionByIndex(currentState.session.id, target);
  }
  const v = await getVersionById(target);
  return v && v.sessionId === currentState.session.id ? v : null;
}

/** Load a version by index (number) or id (string). */
export async function loadVersion(target: number | string): Promise<Version | null> {
  if (!currentState.session) return null;

  let version: Version | null = null;
  if (typeof target === 'number') {
    version = await getVersionByIndex(currentState.session.id, target);
  } else {
    const v = await getVersionById(target);
    // Reject versions from other sessions to avoid cross-session pollution.
    if (v && v.sessionId === currentState.session.id) version = v;
  }
  if (!version) return null;

  currentState = { ...currentState, currentVersion: version };
  updateURL();
  notify();
  return version;
}

export async function listCurrentVersions(): Promise<Version[]> {
  if (!currentState.session) return [];
  return dbListVersions(currentState.session.id);
}

// === URL helpers for sharing ===

export function getSessionUrl(): string {
  if (!currentState.session) return window.location.href;
  const base = window.location.origin + '/editor';
  return `${base}?session=${currentState.session.id}`;
}

export function getGalleryUrl(): string {
  if (!currentState.session) return window.location.href;
  const base = window.location.origin + '/editor';
  return `${base}?session=${currentState.session.id}&gallery`;
}

// === Reference images ===

export async function saveReferenceImages(images: ReferenceImagesData | null): Promise<void> {
  if (!currentState.session) return;
  await dbUpdateSession(currentState.session.id, {
    referenceImages: images,
    updated: Date.now(),
  });
  // Update local state so getState() reflects the change
  currentState = {
    ...currentState,
    session: { ...currentState.session, referenceImages: images },
  };
  notify();
}

export async function getReferenceImagesFromSession(): Promise<ReferenceImagesData | null> {
  if (!currentState.session) return null;
  // Refresh from DB in case it was updated externally
  const session = await getSession(currentState.session.id);
  return session?.referenceImages ?? null;
}

// === Notes ===

export async function addSessionNote(text: string): Promise<SessionNote | null> {
  if (!currentState.session) return null;
  return dbAddNote(currentState.session.id, text);
}

export async function listSessionNotes(): Promise<SessionNote[]> {
  if (!currentState.session) return [];
  return dbListNotes(currentState.session.id);
}

export async function deleteSessionNote(noteId: string): Promise<void> {
  await dbDeleteNote(noteId);
}

export async function updateSessionNote(noteId: string, text: string): Promise<void> {
  await dbUpdateNote(noteId, text);
}

// === Recent error tracking (for agentHints) ===

const recentErrors: { error: string; timestamp: number }[] = [];
const MAX_RECENT_ERRORS = 5;

export function recordError(error: string): void {
  recentErrors.push({ error, timestamp: Date.now() });
  if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
}

export function getRecentErrors(): { error: string; timestamp: number }[] {
  return [...recentErrors];
}

// === Session context (single call for AI agents) ===

export interface SessionContext {
  session: { id: string; name: string; created: number; updated: number; language: 'manifold-js' | 'scad' };
  versions: {
    index: number;
    label: string;
    timestamp: number;
    notes?: string;
    geometrySummary: {
      volume?: number;
      surfaceArea?: number;
      boundingBox?: { dimensions: number[] };
      componentCount?: number;
      genus?: number;
      isManifold?: boolean;
    } | null;
  }[];
  notes: { id: string; text: string; timestamp: number }[];
  currentVersion: { index: number; label: string } | null;
  versionCount: number;
  agentHints: {
    apiDocsUrl: string;
    recommendedEntrypoint: string;
    codeMustReturnManifold: boolean;
    language: 'manifold-js' | 'scad';
    supportedLanguages: string[];
    recentErrors: { error: string; timestamp: number }[];
  };
}

export async function getSessionContext(): Promise<SessionContext | null> {
  if (!currentState.session) return null;

  const session = currentState.session;
  const versions = await dbListVersions(session.id);
  const notes = await dbListNotes(session.id);

  return {
    session: {
      id: session.id,
      name: session.name,
      created: session.created,
      updated: session.updated,
      language: session.language ?? 'manifold-js',
    },
    versions: versions.map(v => {
      const geo = v.geometryData as Record<string, unknown> | null;
      const bb = geo?.boundingBox as Record<string, unknown> | undefined;
      return {
        index: v.index,
        label: v.label,
        timestamp: v.timestamp,
        ...(v.notes ? { notes: v.notes } : {}),
        geometrySummary: geo && geo.status === 'ok' ? {
          volume: geo.volume as number | undefined,
          surfaceArea: geo.surfaceArea as number | undefined,
          boundingBox: bb?.dimensions ? { dimensions: bb.dimensions as number[] } : undefined,
          componentCount: geo.componentCount as number | undefined,
          genus: geo.genus as number | undefined,
          isManifold: geo.isManifold as boolean | undefined,
        } : null,
      };
    }),
    notes: notes.map(n => ({ id: n.id, text: n.text, timestamp: n.timestamp })),
    currentVersion: currentState.currentVersion
      ? { index: currentState.currentVersion.index, label: currentState.currentVersion.label }
      : null,
    versionCount: currentState.versionCount,
    agentHints: {
      apiDocsUrl: '/ai.md',
      recommendedEntrypoint: 'runAndSave',
      codeMustReturnManifold: (session.language ?? 'manifold-js') === 'manifold-js',
      language: session.language ?? 'manifold-js',
      supportedLanguages: ['manifold-js', 'scad'],
      recentErrors: getRecentErrors(),
    },
  };
}

// === Cleanup ===

/** Delete a session if it has no versions and no notes (used for auto-created empty sessions) */
export async function deleteIfEmpty(sessionId: string): Promise<boolean> {
  const count = await getVersionCount(sessionId);
  if (count > 0) return false;
  const notes = await dbListNotes(sessionId);
  if (notes.length > 0) return false;
  await dbDeleteSession(sessionId);
  if (currentState.session?.id === sessionId) {
    currentState = { session: null, currentVersion: null, versionCount: 0 };
  }
  return true;
}

// === Clear all data ===

export async function clearAllSessions(): Promise<void> {
  await clearAllData();
  currentState = { session: null, currentVersion: null, versionCount: 0 };
  updateURL();
  notify();
}

// === Export / Import ===

export async function exportSession(sessionId?: string): Promise<ExportedSession | null> {
  const id = sessionId ?? currentState.session?.id;
  if (!id) return null;

  const session = await getSession(id);
  if (!session) return null;

  const versions = await dbListVersions(id);
  const notes = await dbListNotes(id);

  return {
    partwright: '1.0',
    session: { name: session.name, created: session.created, updated: session.updated, referenceImages: session.referenceImages ?? null, ...(session.language ? { language: session.language } : {}) },
    versions: versions.map(v => ({
      index: v.index,
      code: v.code,
      label: v.label,
      geometryData: v.geometryData,
      timestamp: v.timestamp,
      ...(v.notes ? { notes: v.notes } : {}),
    })),
    ...(notes.length > 0 ? { notes: notes.map(n => ({ text: n.text, timestamp: n.timestamp })) } : {}),
  };
}

export async function importSession(
  data: ExportedSession,
  regenerateThumbnail?: (code: string) => Promise<Blob | null>,
): Promise<Session> {
  const session = await dbCreateSession(data.session.name, data.session.language);

  // Restore reference images if present in the exported data
  if (data.session.referenceImages) {
    await dbUpdateSession(session.id, { referenceImages: data.session.referenceImages });
  }

  for (const v of data.versions) {
    let thumbnail: Blob | null = null;
    if (regenerateThumbnail) {
      thumbnail = await regenerateThumbnail(v.code);
    }
    await dbSaveVersion(session.id, v.code, v.geometryData, thumbnail, v.label, v.notes);
  }

  // Restore session notes
  if (data.notes) {
    for (const n of data.notes) {
      await dbAddNote(session.id, n.text);
    }
  }

  const count = await getVersionCount(session.id);
  const latest = await getLatestVersion(session.id);
  currentState = { session, currentVersion: latest, versionCount: count };
  updateURL();
  notify();
  return session;
}
