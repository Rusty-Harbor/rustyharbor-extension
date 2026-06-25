// Checks in with RustyHarbor every so often using your existing Steam login,
// asks if there's any trade to send, accept, or take back, and carries out
// whatever it's told then reports the result back.

import { getSteamCreds, getLastAlertCount, setLastAlertCount } from './storage';
import { sendTrade, acceptTrade, withdrawTrade } from './tradeDispatch';
import { fetchOwnRustInventory } from './inventoryFetch';
import { handleOrderAlert } from './orderAlert';
import type { ConnState, PollResponse, TradeAck } from '../shared/messages';

const POLL_URL = 'https://api.rustyharbor.com/api/p2p/extension/poll';
const ACK_URL = 'https://api.rustyharbor.com/api/p2p/extension/ack';
const INVENTORY_URL = 'https://api.rustyharbor.com/api/p2p/extension/inventory';
const REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface PollOutcome {
  connState: ConnState;
  personaName: string | null;
}

function authHeaders(steamId: string, token: string, sessionId: string): Record<string, string> {
  return {
    'x-steam-id': steamId,
    'x-steam-token': token,
    'x-steam-sessionid': sessionId || '',
  };
}

async function postAck(headers: Record<string, string>, ack: TradeAck): Promise<void> {
  try {
    await fetchWithTimeout(ACK_URL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(ack),
    });
  } catch {}
}

async function runWork(headers: Record<string, string>, body: PollResponse): Promise<void> {
  for (const w of body.sendTrades ?? []) {
    const data = await sendTrade(w);
    await postAck(headers, { messageId: w.messageId, data });
  }
  for (const w of body.accepts ?? []) {
    const data = await acceptTrade(w);
    await postAck(headers, { messageId: w.messageId, data });
  }
  for (const w of body.withdraws ?? []) {
    const data = await withdrawTrade(w);
    await postAck(headers, { messageId: w.messageId, data });
  }
}

async function maybeAlert(count: number): Promise<void> {
  const last = await getLastAlertCount();
  if (count > last) await handleOrderAlert(count);
  if (count !== last) await setLastAlertCount(count);
}

async function maybeFetchInventory(
  headers: Record<string, string>,
  steamId: string,
  wanted: boolean | undefined,
): Promise<void> {
  if (!wanted) return;
  const raw = await fetchOwnRustInventory(steamId);
  if (!raw) return;
  try {
    await fetchWithTimeout(INVENTORY_URL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(raw),
    });
  } catch {}
}

export async function pollOnce(): Promise<PollOutcome> {
  const creds = await getSteamCreds();
  if (!creds?.steamId || !creds?.accessToken) {
    return { connState: 'offline', personaName: null };
  }

  const headers = authHeaders(creds.steamId, creds.accessToken, creds.sessionId);
  let res: Response;
  try {
    res = await fetchWithTimeout(POLL_URL, { headers });
  } catch {
    return { connState: 'offline', personaName: null };
  }
  if (!res.ok) return { connState: 'offline', personaName: null };

  let body: PollResponse;
  try { body = await res.json() as PollResponse; }
  catch { return { connState: 'offline', personaName: null }; }

  if (body.status === 'no-account') return { connState: 'no-account', personaName: null };
  if (body.status !== 'ok') return { connState: 'offline', personaName: null };

  await runWork(headers, body);
  await maybeAlert(body.alert?.count ?? 0);
  await maybeFetchInventory(headers, creds.steamId, body.fetchInventory);

  return { connState: 'online', personaName: body.profile?.personaName ?? null };
}
