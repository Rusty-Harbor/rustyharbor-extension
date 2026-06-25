// Sends and withdraws Steam trade offers on your behalf when RustyHarbor tells
// you a sale needs delivering or an expired offer needs to be taken back. It
// only ever talks to steamcommunity.com, using the Steam session already in
// your browser. RustyHarbor decides what to do; this just carries it out.

import browser from './browser';
import { getSteamCreds } from './storage';
import { refreshSteamSession } from './steamSession';
import type { SendTradeWork, WithdrawTradeWork, AcceptTradeWork, TradeAck } from '../shared/messages';

type AckData = TradeAck['data'];
type SendData = Omit<SendTradeWork, 'name' | 'messageId'>;
type AcceptData = Omit<AcceptTradeWork, 'name' | 'messageId'>;
type WithdrawData = Omit<WithdrawTradeWork, 'name' | 'messageId'>;

const SEND_URL = 'https://steamcommunity.com/tradeoffer/new/send';
const RETRY_DELAY_MS = 2500;
const TRADE_URL_FILTER = '*://steamcommunity.com/tradeoffer/*';

const inFlight = new Set<string>();

const cookieApi = (browser as unknown as {
  cookies?: {
    get: (d: { url: string; name: string }) => Promise<{ value: string } | null>;
  };
}).cookies;

async function liveSessionId(): Promise<string | null> {
  if (!cookieApi) return null;
  try {
    const c = await cookieApi.get({ url: 'https://steamcommunity.com', name: 'sessionid' });
    return c?.value ?? null;
  } catch {
    return null;
  }
}

const dnr = (browser as unknown as {
  declarativeNetRequest?: {
    updateSessionRules: (opts: { addRules?: unknown[]; removeRuleIds?: number[] }) => Promise<void>;
    getSessionRules?: () => Promise<{ id: number; condition?: { urlFilter?: string } }[]>;
  };
}).declarativeNetRequest;

const webReq = (browser as unknown as {
  webRequest?: {
    onBeforeSendHeaders: {
      addListener: (
        fn: (d: { requestHeaders?: { name: string; value?: string }[] }) => unknown,
        filter: { urls: string[] },
        extra: string[],
      ) => void;
      removeListener: (fn: (...args: unknown[]) => unknown) => void;
    };
    handlerBehaviorChanged?: () => Promise<void>;
  };
}).webRequest;

let dnrRuleCounter = 1000;

export async function clearStaleTradeRules(): Promise<void> {
  if (!dnr?.getSessionRules) return;
  try {
    const rules = await dnr.getSessionRules();
    const ids = rules
      .filter((r) => (r.condition?.urlFilter || '').includes('steamcommunity.com/tradeoffer/'))
      .map((r) => r.id);
    if (ids.length > 0) await dnr.updateSessionRules({ removeRuleIds: ids });
  } catch {}
}

async function withTradeHeaders<T>(referer: string, run: () => Promise<T>): Promise<T> {
  if (dnr) {
    const ruleId = ++dnrRuleCounter;
    await dnr.updateSessionRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Referer', operation: 'set', value: referer },
            { header: 'Origin', operation: 'set', value: 'https://steamcommunity.com' },
          ],
        },
        condition: { urlFilter: '||steamcommunity.com/tradeoffer/', requestMethods: ['post'] },
      }],
    });
    try {
      return await run();
    } finally {
      try { await dnr.updateSessionRules({ removeRuleIds: [ruleId] }); } catch {}
    }
  }

  if (webReq) {
    const listener = (details: { requestHeaders?: { name: string; value?: string }[] }) => {
      const headers = (details.requestHeaders || []).filter((h) => {
        const n = h.name.toLowerCase();
        return n !== 'referer' && n !== 'origin';
      });
      headers.push({ name: 'Referer', value: referer });
      headers.push({ name: 'Origin', value: 'https://steamcommunity.com' });
      return { requestHeaders: headers };
    };
    webReq.onBeforeSendHeaders.addListener(listener, { urls: [TRADE_URL_FILTER] }, ['blocking', 'requestHeaders']);
    if (webReq.handlerBehaviorChanged) { try { await webReq.handlerBehaviorChanged(); } catch {} }
    try {
      return await run();
    } finally {
      try { webReq.onBeforeSendHeaders.removeListener(listener as (...args: unknown[]) => unknown); } catch {}
    }
  }

  return run();
}

function tokenFromTradelink(tradelink: string): string {
  const i = tradelink.indexOf('token=');
  return i === -1 ? '' : tradelink.substring(i + 6);
}

async function postForm(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
}

async function steamReason(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text ? ` ${text.slice(0, 120)}` : '';
  } catch {
    return '';
  }
}

export async function sendTrade(data: SendData): Promise<AckData> {
  if (inFlight.has(data.clientRequestId)) {
    return { status: 'error', error: 'in_flight' };
  }
  inFlight.add(data.clientRequestId);
  try {
    return await withTradeHeaders(data.tradelink, async () => {
      const buildBody = async (): Promise<string | null> => {
        const creds = await getSteamCreds();
        const sessionId = (await liveSessionId()) ?? creds?.sessionId;
        if (!sessionId) return null;
        const token = tokenFromTradelink(data.tradelink);
        const createParams = JSON.stringify({ trade_offer_access_token: token });
        return `sessionid=${sessionId}`
          + '&serverid=1'
          + `&partner=${data.partner}`
          + `&tradeoffermessage=${data.tradeoffermessage}`
          + `&json_tradeoffer=${JSON.stringify(data.json_tradeoffer)}`
          + '&captcha='
          + `&trade_offer_create_params=${createParams}`;
      };

      const firstBody = await buildBody();
      if (firstBody === null) return { status: 'error', error: 'no_session' };

      let res: Response;
      try {
        res = await postForm(SEND_URL, firstBody);
      } catch {
        return { status: 'error', error: 'network' };
      }

      if (res.status === 401) {
        const refreshed = await refreshSteamSession();
        if (!refreshed) return { status: 'error', error: 'http_401' };
        const retryBody = await buildBody();
        if (retryBody === null) return { status: 'error', error: 'no_session' };
        try {
          res = await postForm(SEND_URL, retryBody);
        } catch {
          return { status: 'error', error: 'network' };
        }
      }

      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
      }
      if (res.status < 200 || res.status >= 300) {
        return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
      }

      try {
        return { status: 'ok', value: await res.json() };
      } catch {
        return { status: 'error', error: 'bad_response' };
      }
    });
  } finally {
    inFlight.delete(data.clientRequestId);
  }
}

export async function acceptTrade(data: AcceptData): Promise<AckData> {
  if (!/^\d+$/.test(String(data.trade_id))) return { status: 'error', error: 'bad_trade_id' };

  const url = `https://steamcommunity.com/tradeoffer/${data.trade_id}/accept`;
  const referer = `https://steamcommunity.com/tradeoffer/${data.trade_id}/`;

  return withTradeHeaders(referer, async () => {
    const buildBody = async (): Promise<string | null> => {
      const sessionId = (await liveSessionId()) ?? (await getSteamCreds())?.sessionId;
      if (!sessionId) return null;
      return `sessionid=${sessionId}`
        + '&serverid=1'
        + `&tradeofferid=${data.trade_id}`
        + `&partner=${data.partner}`
        + '&captcha=';
    };

    const body = await buildBody();
    if (body === null) return { status: 'error', error: 'no_session' };

    let res: Response;
    try {
      res = await postForm(url, body);
    } catch {
      return { status: 'error', error: 'network' };
    }

    if (res.status === 401) {
      const refreshed = await refreshSteamSession();
      if (!refreshed) return { status: 'error', error: 'http_401' };
      const retry = await buildBody();
      if (retry === null) return { status: 'error', error: 'no_session' };
      try {
        res = await postForm(url, retry);
      } catch {
        return { status: 'error', error: 'network' };
      }
    }

    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
    }
    if (res.status < 200 || res.status >= 300) {
      return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
    }

    try {
      return { status: 'ok', value: await res.json() };
    } catch {
      return { status: 'ok', value: null };
    }
  });
}

export async function withdrawTrade(data: WithdrawData): Promise<AckData> {
  const action = data.action === 'cancel' || data.action === 'decline' ? data.action : null;
  if (!action) return { status: 'error', error: 'bad_action' };
  if (!/^\d+$/.test(String(data.trade_id))) return { status: 'error', error: 'bad_trade_id' };

  const url = `https://steamcommunity.com/tradeoffer/${data.trade_id}/${action}`;
  const referer = `https://steamcommunity.com/tradeoffer/${data.trade_id}/`;

  return withTradeHeaders(referer, async () => {
    const creds = await getSteamCreds();
    const sessionId = (await liveSessionId()) ?? creds?.sessionId;
    if (!sessionId) return { status: 'error', error: 'no_session' };
    const body = `sessionid=${encodeURIComponent(sessionId)}`;

    let res: Response;
    try {
      res = await postForm(url, body);
    } catch {
      return { status: 'error', error: 'network' };
    }

    if (res.status === 401) {
      const refreshed = await refreshSteamSession();
      if (!refreshed) return { status: 'error', error: 'http_401' };
      const fresh = (await liveSessionId()) ?? (await getSteamCreds())?.sessionId;
      if (!fresh) return { status: 'error', error: 'no_session' };
      try {
        res = await postForm(url, `sessionid=${encodeURIComponent(fresh)}`);
      } catch {
        return { status: 'error', error: 'network' };
      }
    }

    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
    }
    if (res.status < 200 || res.status >= 300) {
      return { status: 'error', error: `http_${res.status}${await steamReason(res)}` };
    }

    try {
      return { status: 'ok', value: await res.json() };
    } catch {
      return { status: 'ok', value: null };
    }
  });
}
