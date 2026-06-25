// The little window that opens when you click the extension's toolbar icon.
// It shows whether you're signed in to Steam and connected to our server.

import browser from '../lib/browser';
import type { RuntimeStatusReply } from '../shared/messages';

const SIGNUP_URL = 'https://rustyharbor.com';
const STEAM_LOGIN_URL = 'https://steamcommunity.com/login/home';

async function getStatus(): Promise<RuntimeStatusReply | null> {
  try {
    const reply = await browser.runtime.sendMessage({ type: 'get-status' });
    return reply as RuntimeStatusReply;
  } catch {
    return null;
  }
}

function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node as T;
}

function titleRow(ledClass: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'state-title';
  const led = document.createElement('span');
  led.className = `led ${ledClass}`;
  p.append(led, document.createTextNode(text));
  return p;
}

function sub(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'state-sub';
  p.textContent = text;
  return p;
}

function linkBtn(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

function render(status: RuntimeStatusReply | null): void {
  const root = el('#state');
  root.className = 'state';
  root.replaceChildren();

  if (!status) {
    root.append(titleRow('led-offline', 'Something went wrong'), sub('Try closing and reopening this window.'));
    return;
  }

  if (!status.steamSignedIn) {
    root.append(
      titleRow('led-pairing', 'Sign in to Steam'),
      sub('Sign in to Steam in this browser to start trading.'),
      linkBtn(STEAM_LOGIN_URL, 'Sign in to Steam'),
    );
    return;
  }

  if (status.connState === 'no-account') {
    root.append(
      titleRow('led-offline', 'No account found'),
      sub('This Steam login has no RustyHarbor account. Sign up to start trading.'),
      linkBtn(SIGNUP_URL, 'Go to rustyharbor.com'),
    );
    return;
  }

  if (status.connState === 'online') {
    root.append(
      titleRow('led-online', 'Online'),
      sub(status.steamUsername ? `Signed in as ${status.steamUsername}` : 'Connected'),
    );
    return;
  }

  root.append(titleRow('led-pairing', 'Connecting…'), sub('Linking this browser to our server.'));
}

function setBuildInfo(status: RuntimeStatusReply | null): void {
  const span = el('#build-info');
  if (!status) { span.textContent = ''; return; }
  span.textContent = `v${status.buildVersion} ${status.buildCommit}`;
}

let lastOnlineAt = 0;
const CONNECTING_GRACE_MS = 5000;

async function refresh(): Promise<void> {
  const status = await getStatus();
  if (status && status.steamSignedIn && status.connState === 'online') {
    lastOnlineAt = Date.now();
  }
  let shown = status;
  if (
    status && status.steamSignedIn && status.connState === 'connecting'
    && Date.now() - lastOnlineAt < CONNECTING_GRACE_MS
  ) {
    shown = { ...status, connState: 'online' };
  }
  render(shown);
  setBuildInfo(status);
}

void refresh();
setInterval(() => { void refresh(); }, 2000);
