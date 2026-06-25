// Runs on rustyharbor.com pages. It lets the setup page check whether the
// extension is installed and connected, and change your sale-alert settings.

import browser from '../lib/browser';
import type { PageMessage } from '../shared/messages';

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  const msg = event.data as PageMessage | null;
  if (!msg || typeof msg !== 'object') return;
  if (msg.source !== 'rustyharbor-setup') return;

  if (msg.type === 'probe') {
    let status: { connState?: string; steamSignedIn?: boolean; soundEnabled?: boolean; notifEnabled?: boolean; buildVersion?: string } = {};
    try {
      status = await browser.runtime.sendMessage({ type: 'get-status' }) as typeof status;
    } catch {}
    window.postMessage({
      source: 'rustyharbor-extension',
      type: 'probe-reply',
      installed: true,
      online: status?.connState === 'online',
      connState: status?.connState ?? 'offline',
      steamSignedIn: !!status?.steamSignedIn,
      soundEnabled: status?.soundEnabled !== false,
      notifEnabled: status?.notifEnabled !== false,
      version: status?.buildVersion ?? '0.0.0',
    }, window.location.origin);
  }

  if (msg.type === 'set-sound') {
    try {
      await browser.runtime.sendMessage({ type: 'set-sound', enabled: !!msg.enabled });
    } catch {}
  }

  if (msg.type === 'set-notif') {
    try {
      await browser.runtime.sendMessage({ type: 'set-notif', enabled: !!msg.enabled });
    } catch {}
  }
});
