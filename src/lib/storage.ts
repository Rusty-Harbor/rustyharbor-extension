// Saves small bits of information inside your own browser, such as the link to
// your account and your sale-alert preferences. Nothing here leaves your computer.

import browser from './browser';

const STEAM_CREDS_KEY = 'steam_creds';
const SOUND_ENABLED_KEY = 'sound_enabled';
const NOTIF_ENABLED_KEY = 'notif_enabled';
const LAST_ALERT_COUNT_KEY = 'last_alert_count';

export interface SteamCreds {
  steamId: string;
  sessionId: string;
  accessToken: string | null;
}

export async function getSteamCreds(): Promise<SteamCreds | null> {
  const out = await browser.storage.local.get(STEAM_CREDS_KEY);
  return (out[STEAM_CREDS_KEY] as SteamCreds | undefined) ?? null;
}

export async function setSteamCreds(creds: SteamCreds): Promise<void> {
  await browser.storage.local.set({ [STEAM_CREDS_KEY]: creds });
}

export async function clearSteamCreds(): Promise<void> {
  await browser.storage.local.remove(STEAM_CREDS_KEY);
}

export async function getSoundEnabled(): Promise<boolean> {
  const out = await browser.storage.local.get(SOUND_ENABLED_KEY);
  return (out[SOUND_ENABLED_KEY] as boolean | undefined) ?? true;
}

export async function setSoundEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [SOUND_ENABLED_KEY]: enabled });
}

export async function getNotifEnabled(): Promise<boolean> {
  const out = await browser.storage.local.get(NOTIF_ENABLED_KEY);
  return (out[NOTIF_ENABLED_KEY] as boolean | undefined) ?? true;
}

export async function setNotifEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [NOTIF_ENABLED_KEY]: enabled });
}

export async function getLastAlertCount(): Promise<number> {
  const out = await browser.storage.local.get(LAST_ALERT_COUNT_KEY);
  return (out[LAST_ALERT_COUNT_KEY] as number | undefined) ?? 0;
}

export async function setLastAlertCount(count: number): Promise<void> {
  await browser.storage.local.set({ [LAST_ALERT_COUNT_KEY]: count });
}
