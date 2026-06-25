// Reads your own Rust inventory from Steam using your existing sign-in, from
// your own computer, and hands the raw result back so RustyHarbor can store it.

const RUST_APP_ID = 252490;
const RUST_CONTEXT_ID = 2;
const PAGE_COUNT = 2000;
const FETCH_TIMEOUT_MS = 15_000;

export interface RawInventory {
  assets: unknown[];
  descriptions: unknown[];
}

export async function fetchOwnRustInventory(steamId: string): Promise<RawInventory | null> {
  if (!steamId) return null;
  const url =
    `https://steamcommunity.com/inventory/${steamId}/${RUST_APP_ID}/${RUST_CONTEXT_ID}` +
    `?l=english&count=${PAGE_COUNT}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { assets?: unknown[]; descriptions?: unknown[] } | null;
    if (!body || !Array.isArray(body.assets) || !Array.isArray(body.descriptions)) {
      return null;
    }
    return { assets: body.assets, descriptions: body.descriptions };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
