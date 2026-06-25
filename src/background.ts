// The always-running part of the extension. Every half minute it checks in
// with our server using your existing Steam login, carries out any trade it's
// told to, keeps you signed in to Steam, and tells the popup what's going on.
// There is no separate pairing and no always-open connection.

import browser from './lib/browser';
import type { RuntimeMessage, RuntimeStatusReply, ConnState } from './shared/messages';
import {
  getSteamCreds,
  getSoundEnabled, setSoundEnabled,
  getNotifEnabled, setNotifEnabled,
} from './lib/storage';
import { runSessionCheck } from './lib/steamSession';
import { clearStaleTradeRules } from './lib/tradeDispatch';
import { pollOnce } from './lib/pollClient';

let connState: ConnState = 'offline';
let serverUsername: string | null = null;
let steamSignedIn = false;
let polling = false;
let sessionChecking = false;
let lastPollAt = 0;
const MIN_ONDEMAND_POLL_GAP_MS = 5000;

async function readBuildInfo(): Promise<{ version: string; commit: string }> {
  try {
    const url = browser.runtime.getURL('build-info.json');
    const res = await fetch(url);
    const data = await res.json() as { version?: string; commit?: string };
    return { version: data.version ?? '0.0.0', commit: data.commit ?? 'dev' };
  } catch {
    return { version: '0.0.0', commit: 'dev' };
  }
}

async function sessionTick(): Promise<void> {
  if (sessionChecking) return;
  sessionChecking = true;
  try {
    const session = await runSessionCheck();
    steamSignedIn = session.signedIn;
  } finally {
    sessionChecking = false;
  }
}

async function pollTick(): Promise<void> {
  if (polling) return;
  polling = true;
  lastPollAt = Date.now();
  try {
    const outcome = await pollOnce();
    connState = outcome.connState;
    serverUsername = outcome.personaName;
  } finally {
    polling = false;
  }
}

async function tick(): Promise<void> {
  await Promise.allSettled([sessionTick(), pollTick()]);
}

browser.runtime.onMessage.addListener(async (raw: unknown) => {
  const msg = raw as RuntimeMessage;

  if (msg.type === 'get-status') {
    // The /setup page probes every 1s. Don't poll on every probe — only kick
    // an on-demand poll when we're NOT already online and it's been a few
    // seconds since the last one (so setup connects fast on first load without
    // a healthy extension re-polling every second; the 30s alarm does the rest).
    if (connState !== 'online' && Date.now() - lastPollAt >= MIN_ONDEMAND_POLL_GAP_MS) {
      void tick();
    }
    const [creds, soundEnabled, notifEnabled, build] = await Promise.all([
      getSteamCreds(), getSoundEnabled(), getNotifEnabled(), readBuildInfo(),
    ]);
    steamSignedIn = !!creds?.steamId;
    const reply: RuntimeStatusReply = {
      type: 'status',
      connState,
      steamSignedIn,
      steamUsername: connState === 'online' ? serverUsername : null,
      soundEnabled,
      notifEnabled,
      buildVersion: build.version,
      buildCommit: build.commit,
    };
    return reply;
  }

  if (msg.type === 'set-sound') {
    await setSoundEnabled(msg.enabled);
    return { ok: true };
  }

  if (msg.type === 'set-notif') {
    await setNotifEnabled(msg.enabled);
    return { ok: true };
  }

  return { ok: false, error: 'unknown message' };
});

const POLL_ALARM = 'rh-poll';
const SESSION_ALARM = 'rh-session';

if (browser.alarms) {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) void pollTick();
    else if (alarm.name === SESSION_ALARM) void sessionTick();
  });
}
browser.runtime.onStartup?.addListener(() => { void boot(); });
browser.runtime.onInstalled?.addListener(() => { void boot(); });

let booting = false;
async function boot(): Promise<void> {
  if (booting) return;
  booting = true;
  try {
    await clearStaleTradeRules();
    if (browser.alarms) {
      browser.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
      browser.alarms.create(SESSION_ALARM, { periodInMinutes: 1 });
    }
    await tick();
  } finally {
    booting = false;
  }
}

void boot();
