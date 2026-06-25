// A tiny hidden page whose only job is to play the sale sound, because in
// Chrome the always-running part of the extension isn't allowed to play audio itself.

import browser from './lib/browser';

browser.runtime.onMessage.addListener((msg: { type?: string; url?: string }) => {
  if (msg?.type !== 'play-sound' || !msg.url) return;
  try {
    const audio = new Audio(msg.url);
    void audio.play().catch(() => {});
  } catch {}
});
