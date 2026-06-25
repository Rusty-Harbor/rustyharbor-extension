// When you sell something, this lets you know you have a trade to send, even
// if the RustyHarbor website isn't open. It can show a desktop notification and
// play a short sound; each can be turned on or off in your settings.

import browser from './browser';
import { getSoundEnabled, getNotifEnabled } from './storage';

const PROFILE_HISTORY_URL = 'https://rustyharbor.com/profile#history';
const NOTIFICATION_ID = 'rh-order-alert';
const SOUND_PATH = 'assets/order-alert.mp3';
const OFFSCREEN_PATH = 'offscreen.html';

export async function handleOrderAlert(count: number): Promise<void> {
  const n = Math.max(1, count | 0);
  if (await getNotifEnabled()) void showNotification(n);
  if (await getSoundEnabled()) void playSound();
}

async function showNotification(count: number): Promise<void> {
  try {
    await browser.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-128.png'),
      title: 'RustyHarbor',
      message: `You have ${count} order${count === 1 ? '' : 's'} to fulfill`,
      priority: 2,
    });
  } catch {}
}

browser.notifications?.onClicked?.addListener((id) => {
  if (id !== NOTIFICATION_ID) return;
  void openHistoryTab();
  browser.notifications.clear(NOTIFICATION_ID);
});

async function openHistoryTab(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: 'https://rustyharbor.com/*' });
    if (tabs.length > 0 && tabs[0].id != null) {
      await browser.tabs.update(tabs[0].id, { active: true, url: PROFILE_HISTORY_URL });
      if (tabs[0].windowId != null) await browser.windows.update(tabs[0].windowId, { focused: true });
      return;
    }
    await browser.tabs.create({ url: PROFILE_HISTORY_URL });
  } catch {}
}

async function playSound(): Promise<void> {
  const url = browser.runtime.getURL(SOUND_PATH);
  if (typeof Audio !== 'undefined') {
    try {
      const a = new Audio(url);
      await a.play();
      return;
    } catch {}
  }
  const offscreen = (browser as unknown as {
    offscreen?: {
      hasDocument?: () => Promise<boolean>;
      createDocument: (opts: { url: string; reasons: string[]; justification: string }) => Promise<void>;
    };
  }).offscreen;
  if (!offscreen) return;
  try {
    const has = await offscreen.hasDocument?.();
    if (!has) {
      await offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play the order-alert sound.',
      });
    }
    await browser.runtime.sendMessage({ type: 'play-sound', url });
  } catch {}
}
