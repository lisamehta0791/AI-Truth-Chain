/**
 * Where the signed-in session lives on this device.
 *
 * "Remember this device" keeps the tokens in localStorage so the officer
 * stays signed in across browser restarts — appropriate for a personal
 * device. Without it, tokens go to sessionStorage and are discarded when the
 * tab closes — the right default for a shared station terminal, where the
 * next person to sit down must not inherit the previous officer's authority.
 *
 * Every reader of the token goes through here so the two stores can never
 * disagree.
 */
const ACCESS_KEY = "cot_access_token";
const REFRESH_KEY = "cot_refresh_token";
const REMEMBER_KEY = "cot_remember_device";
const NOTICE_KEY = "cot_storage_notice_ack";

function stores(): Storage[] {
  try {
    return [localStorage, sessionStorage];
  } catch {
    return [];
  }
}

export function getAccessToken(): string | null {
  for (const s of stores()) {
    const v = s.getItem(ACCESS_KEY);
    if (v) return v;
  }
  return null;
}

export function getRefreshToken(): string | null {
  for (const s of stores()) {
    const v = s.getItem(REFRESH_KEY);
    if (v) return v;
  }
  return null;
}

export function saveSession(access: string, refresh: string, rememberDevice: boolean): void {
  clearSession();
  try {
    const target = rememberDevice ? localStorage : sessionStorage;
    target.setItem(ACCESS_KEY, access);
    target.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(REMEMBER_KEY, rememberDevice ? "1" : "0");
  } catch {
    /* storage blocked — the session simply lives in memory for this page */
  }
}

export function clearSession(): void {
  stores().forEach((s) => {
    s.removeItem(ACCESS_KEY);
    s.removeItem(REFRESH_KEY);
  });
}

export function isDeviceRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export function storageNoticeAcknowledged(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return true;
  }
}

export function acknowledgeStorageNotice(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}
