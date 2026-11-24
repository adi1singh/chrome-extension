// Tokens are authenticated by the server. Local decoding only detects expiry.
export function isExpiredToken(token, now = Date.now()) {
  if (typeof token !== 'string' || !token.trim()) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false; // Some deployed sessions use opaque tokens.
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= now;
  } catch { return true; }
}

export function readStorage(keys = null) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, result => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result || {});
    });
  });
}

function removeStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export async function clearSession(expectedToken) {
  const stored = await readStorage();
  const current = stored.jobgen_session_token || stored.jobgen_jwt_token;
  // An old request must not sign out a newly logged-in account.
  if (arguments.length > 0 && current !== expectedToken) return false;
  await removeStorage(Object.keys(stored));
  return true;
}

export async function setSessionToken(token) {
  if (isExpiredToken(token)) return false;
  const stored = await readStorage();
  const previous = stored.jobgen_session_token || stored.jobgen_jwt_token;
  if (previous !== token && !await clearSession(previous)) return false;
  await chrome.storage.local.set({ jobgen_session_token: token });
  return true;
}

export async function getSessionToken() {
  const stored = await readStorage(['jobgen_session_token', 'jobgen_jwt_token']);
  const token = stored.jobgen_session_token || stored.jobgen_jwt_token;
  if (!token) return null;
  if (isExpiredToken(token)) { await clearSession(token); return null; }
  return token;
}
