// Reads a couple of small pieces of text out of a Steam page (like your Steam
// ID) and checks when your Steam access pass runs out. These only look at text
// we already have; they send nothing.

export function scrapeGlobalFromHtml(html: string, varName: string): string | null {
  const re = new RegExp(`${varName}\\s*=\\s*"([^"]+)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

export function scrapeAccessTokenFromJson(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    const token = parsed?.data?.webapi_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function tokenExpiresWithin(token: string | null, withinSeconds: number): boolean {
  if (!token) return true;
  const parts = token.split('.');
  if (parts.length < 2) return true;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return true;
    return payload.exp - Math.floor(Date.now() / 1000) <= withinSeconds;
  } catch {
    return true;
  }
}
