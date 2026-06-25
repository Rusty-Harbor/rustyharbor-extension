// Quietly checks that you're still signed in to Steam and that your Steam
// access pass is still fresh, renewing it for you in the background when it's
// about to run out. If you get fully signed out and can't be renewed, it
// forgets your Steam details so the popup can ask you to sign in. Run on the
// same schedule as the regular check-in, so it keeps working with no tab open.

import { scrapeGlobalFromHtml, scrapeAccessTokenFromJson, tokenExpiresWithin } from './steamScrape';
import { setSteamCreds, clearSteamCreds, getSteamCreds } from './storage';

const SIGNED_OUT_THRESHOLD = 3;
const REFRESH_BACKOFF_MS = 5 * 60 * 1000;
const TOKEN_RENEW_LEAD_SECONDS = 10 * 60;
const STEAM_TIMEOUT_MS = 10_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STEAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let signedOutCount = 0;
let lastRefreshAttemptAt = 0;

interface PollOutcome {
  signedIn: boolean;
  refreshed: boolean;
}

async function runJwtRefresh(): Promise<void> {
  try {
    await timedFetch(
      `https://login.steampowered.com/jwt/refresh?redir=${encodeURIComponent('https://steamcommunity.com/')}`,
      { credentials: 'include', mode: 'no-cors' },
    );
  } catch {}
}

async function fetchSteamHomepage(refresh = false): Promise<string | null> {
  if (refresh) await runJwtRefresh();
  try {
    const res = await timedFetch('https://steamcommunity.com/', {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchAccessToken(): Promise<string | null> {
  try {
    const res = await timedFetch('https://steamcommunity.com/pointssummary/ajaxgetasyncconfig', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return scrapeAccessTokenFromJson(await res.text());
  } catch {
    return null;
  }
}

function parseSignedInState(html: string | null): { signedIn: boolean; steamId: string | null; ambiguous: boolean } {
  if (!html) return { signedIn: false, steamId: null, ambiguous: true };
  // The ONLY trustworthy signed-out signal is Steam's explicit `g_steamID = false`.
  // Any other shape — a Cloudflare interstitial, an A/B homepage variant, a
  // throttled/partial 200 that simply lacks the var — is ambiguous, NOT proof of
  // sign-out. Counting "g_steamID absent" as a sign-out vote would wipe a still-
  // signed-in user's creds after a few odd responses and knock them offline.
  if (html.includes('g_steamID = false')) {
    return { signedIn: false, steamId: null, ambiguous: false };
  }
  const steamId = scrapeGlobalFromHtml(html, 'g_steamID');
  if (!steamId || steamId === 'false') {
    return { signedIn: false, steamId: null, ambiguous: true };
  }
  return { signedIn: true, steamId, ambiguous: false };
}

function canAttemptRefresh(): boolean {
  return Date.now() - lastRefreshAttemptAt >= REFRESH_BACKOFF_MS;
}

async function persistCreds(steamId: string, accessToken: string | null): Promise<void> {
  const existing = await getSteamCreds();
  await setSteamCreds({
    steamId,
    sessionId: existing?.sessionId ?? '',
    accessToken: accessToken ?? existing?.accessToken ?? null,
  });
}

async function resolveFreshToken(): Promise<string | null> {
  const existing = await getSteamCreds();
  if (existing?.accessToken && !tokenExpiresWithin(existing.accessToken, TOKEN_RENEW_LEAD_SECONDS)) {
    return existing.accessToken;
  }
  let token = await fetchAccessToken();
  if (!token && canAttemptRefresh()) {
    lastRefreshAttemptAt = Date.now();
    await runJwtRefresh();
    token = await fetchAccessToken();
  }
  return token;
}

async function tick(): Promise<PollOutcome> {
  const { signedIn, ambiguous, steamId } = parseSignedInState(await fetchSteamHomepage(false));

  if (signedIn && steamId) {
    const before = (await getSteamCreds())?.accessToken ?? null;
    const token = await resolveFreshToken();
    await persistCreds(steamId, token);
    signedOutCount = 0;
    return { signedIn: true, refreshed: !!token && token !== before };
  }
  if (ambiguous) {
    return { signedIn: false, refreshed: false };
  }

  signedOutCount++;
  if (signedOutCount >= SIGNED_OUT_THRESHOLD) {
    if (canAttemptRefresh()) {
      lastRefreshAttemptAt = Date.now();
      const recovered = parseSignedInState(await fetchSteamHomepage(true));
      if (recovered.signedIn && recovered.steamId) {
        await persistCreds(recovered.steamId, await fetchAccessToken());
        signedOutCount = 0;
        return { signedIn: true, refreshed: true };
      }
    }
    await clearSteamCreds();
  }
  return { signedIn: false, refreshed: false };
}

export async function runSessionCheck(): Promise<PollOutcome> {
  return tick();
}

export async function refreshSteamSession(): Promise<boolean> {
  const { signedIn, steamId } = parseSignedInState(await fetchSteamHomepage(true));
  if (!signedIn || !steamId) return false;
  await persistCreds(steamId, await fetchAccessToken());
  return true;
}
