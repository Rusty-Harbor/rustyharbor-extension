// Runs on Steam pages while you're signed in. Reads only the few things we
// need to act for you: your Steam ID, your session, and a short-lived access
// token Steam itself uses. Nothing else is read, and your password is never seen.

import { scrapeGlobalFromHtml, scrapeAccessTokenFromJson } from '../lib/steamScrape';
import { setSteamCreds, clearSteamCreds } from '../lib/storage';

function readPageHtml(): string {
  return document.documentElement.outerHTML;
}

function readSessionIdFromCookies(): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === 'sessionid') return decodeURIComponent(v ?? '');
  }
  return null;
}

async function fetchAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('https://steamcommunity.com/pointssummary/ajaxgetasyncconfig', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return scrapeAccessTokenFromJson(await res.text());
  } catch {
    return null;
  }
}

async function syncCredsFromPage(): Promise<void> {
  const html = readPageHtml();
  const steamId = scrapeGlobalFromHtml(html, 'g_steamID');
  if (!steamId || steamId === 'false') {
    await clearSteamCreds();
    return;
  }
  const sessionId = readSessionIdFromCookies();
  if (!sessionId) return;

  const accessToken = await fetchAccessToken();

  await setSteamCreds({
    steamId,
    sessionId,
    accessToken,
  });
}

void syncCredsFromPage();
