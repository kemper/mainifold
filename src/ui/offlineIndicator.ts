// Global offline indicator.
//
// A small fixed pill that appears only when the browser reports it's offline.
// It reassures the user that the app still works — their work is saved locally
// and modeling keeps running — while explaining that cloud AI is unavailable.
// Hidden (and invisible to tests, which run with navigator.onLine === true)
// whenever there's connectivity, so it's purely additive.

import { onConnectivityChange } from '../util/connectivity';

let pill: HTMLElement | null = null;

export function initOfflineIndicator(): void {
  if (pill) return; // singleton — installed once at boot
  pill = document.createElement('div');
  pill.id = 'offline-indicator';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  pill.style.cssText =
    'position:fixed;bottom:12px;left:12px;z-index:9998;display:none;' +
    'align-items:center;gap:6px;padding:6px 10px;border-radius:9999px;' +
    'font-size:12px;font-weight:500;pointer-events:none;' +
    'background:#451a03;color:#fbbf24;border:1px solid #92400e;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.4);';
  // Dot + label. Modeling and the local AI model keep working; only cloud
  // providers and downloads need the network.
  const dot = document.createElement('span');
  dot.style.cssText = 'width:7px;height:7px;border-radius:9999px;background:#fbbf24;display:inline-block;';
  const label = document.createElement('span');
  label.textContent = 'Offline — your work is saved locally';
  pill.append(dot, label);
  document.body.appendChild(pill);

  onConnectivityChange((online) => {
    if (!pill) return;
    pill.style.display = online ? 'none' : 'flex';
  });
}
