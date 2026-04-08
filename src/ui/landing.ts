// Landing page — shown when no URL params direct to a specific view

import { listSessions, type Session } from '../storage/sessionManager';
import { getLatestVersion, getVersionCount } from '../storage/db';

export interface LandingCallbacks {
  onOpenEditor: () => void;
  onOpenHelp: () => void;
  onOpenSession: (sessionId: string) => void;
}

export async function createLandingPage(
  container: HTMLElement,
  callbacks: LandingCallbacks,
): Promise<HTMLElement> {
  const page = document.createElement('div');
  page.id = 'landing-page';
  page.className = 'flex flex-col items-center w-full h-full overflow-auto bg-zinc-900 text-zinc-100';

  // Hero section
  const hero = document.createElement('div');
  hero.className = 'flex flex-col items-center text-center pt-16 pb-10 px-6 max-w-2xl';

  const title = document.createElement('h1');
  title.className = 'text-4xl font-bold tracking-tight mb-3';
  title.innerHTML = 'm<span class="text-blue-400">AI</span>nifold';

  const tagline = document.createElement('p');
  tagline.className = 'text-lg text-zinc-400 mb-4';
  tagline.textContent = 'AI-driven parametric CAD in your browser';

  const desc = document.createElement('p');
  desc.className = 'text-sm text-zinc-500 mb-8 max-w-md leading-relaxed';
  desc.textContent = 'Write JavaScript that constructs 3D geometry using boolean operations, and see it render live. Track design iterations with sessions, or let an AI agent drive the whole workflow.';

  const ctas = document.createElement('div');
  ctas.className = 'flex gap-3';

  const openEditorBtn = document.createElement('button');
  openEditorBtn.className = 'px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors';
  openEditorBtn.textContent = 'Open Editor';
  openEditorBtn.addEventListener('click', callbacks.onOpenEditor);

  const helpBtn = document.createElement('button');
  helpBtn.className = 'px-5 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors';
  helpBtn.textContent = 'How does this work?';
  helpBtn.addEventListener('click', callbacks.onOpenHelp);

  ctas.appendChild(openEditorBtn);
  ctas.appendChild(helpBtn);

  hero.appendChild(title);
  hero.appendChild(tagline);
  hero.appendChild(desc);
  hero.appendChild(ctas);
  page.appendChild(hero);

  // Sessions section
  const sessionsSection = document.createElement('div');
  sessionsSection.className = 'w-full max-w-4xl px-6 pb-16';

  const sessionsHeader = document.createElement('h2');
  sessionsHeader.className = 'text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4';
  sessionsHeader.textContent = 'Recent Sessions';
  sessionsSection.appendChild(sessionsHeader);

  const sessions = await listSessions();

  if (sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-center py-12 text-zinc-600 text-sm';
    empty.innerHTML = 'No sessions yet. Open the editor and start building, or use an AI agent to create geometry.';
    sessionsSection.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'grid gap-3';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';

    // Load session tiles in parallel
    const tileData = await Promise.all(
      sessions.slice(0, 20).map(async (session) => {
        const [latestVersion, versionCount] = await Promise.all([
          getLatestVersion(session.id),
          getVersionCount(session.id),
        ]);
        return { session, latestVersion, versionCount };
      }),
    );

    for (const { session, latestVersion, versionCount } of tileData) {
      grid.appendChild(createSessionTile(session, latestVersion, versionCount, callbacks.onOpenSession));
    }

    sessionsSection.appendChild(grid);
  }

  page.appendChild(sessionsSection);

  // Agent instructions footer
  const footer = document.createElement('div');
  footer.className = 'pb-8 text-center';
  const agentLink = document.createElement('a');
  agentLink.className = 'text-xs text-zinc-600 hover:text-zinc-400 transition-colors';
  agentLink.href = '/ai.md';
  agentLink.textContent = 'Using mAInifold with an AI agent? See the agent instructions';
  footer.appendChild(agentLink);
  page.appendChild(footer);

  container.appendChild(page);
  return page;
}

function createSessionTile(
  session: Session,
  latestVersion: { thumbnail: Blob | null; label: string; geometryData: Record<string, unknown> | null } | null,
  versionCount: number,
  onOpen: (id: string) => void,
): HTMLElement {
  const tile = document.createElement('button');
  tile.className = 'flex flex-col bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors overflow-hidden text-left cursor-pointer';
  tile.addEventListener('click', () => onOpen(session.id));

  // Thumbnail
  const thumbContainer = document.createElement('div');
  thumbContainer.className = 'w-full aspect-square bg-zinc-850 flex items-center justify-center overflow-hidden';

  if (latestVersion?.thumbnail) {
    const img = document.createElement('img');
    img.className = 'w-full h-full object-contain';
    img.src = URL.createObjectURL(latestVersion.thumbnail);
    thumbContainer.appendChild(img);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'text-3xl text-zinc-700';
    placeholder.textContent = '\u2B21'; // hexagon
    thumbContainer.appendChild(placeholder);
  }

  tile.appendChild(thumbContainer);

  // Info
  const info = document.createElement('div');
  info.className = 'px-3 py-2';

  const name = document.createElement('div');
  name.className = 'text-xs font-medium text-zinc-200 truncate';
  name.textContent = session.name;

  const meta = document.createElement('div');
  meta.className = 'text-xs text-zinc-500 mt-1 flex justify-between';

  const versions = document.createElement('span');
  versions.textContent = `${versionCount} version${versionCount !== 1 ? 's' : ''}`;

  const date = document.createElement('span');
  date.textContent = formatRelativeDate(session.updated);

  meta.appendChild(versions);
  meta.appendChild(date);

  info.appendChild(name);
  info.appendChild(meta);
  tile.appendChild(info);

  return tile;
}

function formatRelativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
