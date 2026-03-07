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
  getVersionCount,
  type Session,
  type Version,
} from './db';

export type { Session, Version } from './db';

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
    params.delete('gallery');
  }
  const qs = params.toString().replace(/=(?=&|$)/g, '');
  const newUrl = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

export function getSessionIdFromURL(): string | null {
  return new URLSearchParams(window.location.search).get('session');
}

export function getVersionFromURL(): number | null {
  const v = new URLSearchParams(window.location.search).get('v');
  return v ? parseInt(v, 10) : null;
}

export function isGalleryMode(): boolean {
  return new URLSearchParams(window.location.search).has('gallery');
}

// === Session operations ===

export async function createSession(name?: string): Promise<Session> {
  const session = await dbCreateSession(name);
  currentState = { session, currentVersion: null, versionCount: 0 };
  updateURL();
  notify();
  return session;
}

export async function openSession(id: string, versionIndex?: number): Promise<Version | null> {
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

// === Version operations ===

export async function saveVersion(
  code: string,
  geometryData: Record<string, unknown> | null,
  thumbnail: Blob | null,
  label?: string,
): Promise<Version | null> {
  if (!currentState.session) return null;

  const version = await dbSaveVersion(
    currentState.session.id,
    code,
    geometryData,
    thumbnail,
    label,
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

export async function loadVersionByIndex(index: number): Promise<Version | null> {
  if (!currentState.session) return null;

  const version = await getVersionByIndex(currentState.session.id, index);
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
  const base = window.location.origin + window.location.pathname;
  return `${base}?session=${currentState.session.id}`;
}

export function getGalleryUrl(): string {
  if (!currentState.session) return window.location.href;
  const base = window.location.origin + window.location.pathname;
  return `${base}?session=${currentState.session.id}&gallery`;
}
