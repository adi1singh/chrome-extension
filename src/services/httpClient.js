import { clearSession, getSessionToken } from './session.js';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// No automatic retries: apply/save/outcome POSTs may have side effects.
export async function apiFetch(url, options = {}) {
  const { timeoutMs = 30000, ...requestOptions } = options;
  const controller = new AbortController();
  const upstream = requestOptions.signal;
  const onAbort = () => controller.abort(upstream.reason);
  if (upstream?.aborted) onAbort();
  else upstream?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(requestOptions.headers);
  const requestToken = headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  try {
    const response = await fetch(url, { ...requestOptions, signal: controller.signal });
    if ([401, 403].includes(response.status)) {
      if (requestToken) await clearSession(requestToken);
      throw new ApiError('TOKEN_INVALID', 'Please sign in to JobGen again.', response.status);
    }
    if (response.status === 402) throw new ApiError('SUBSCRIPTION_REQUIRED', 'An active subscription is required.', 402);
    if (!response.ok) throw new ApiError('HTTP_ERROR', 'JobGen could not complete this request.', response.status);
    // Buffer JSON within the deadline, rather than timing out only the headers.
    const data = await response.json();
    const nestedStatus = data?.response?.status ?? data?.response?.error ?? data?.status ?? data?.error;
    const status = Number(nestedStatus);
    if (status === 403 || (status === 401 && !String(url).endsWith('/jobgen_linkedin_data')) || data?.error === 'TOKEN_INVALID') {
      if (requestToken) await clearSession(requestToken);
      throw new ApiError('TOKEN_INVALID', 'Please sign in to JobGen again.', response.status);
    }
    if (requestToken && await getSessionToken() !== requestToken) {
      throw new ApiError('SESSION_CHANGED', 'The signed-in account changed. Please try again.');
    }
    if (response.status === 402 || status === 402) {
      throw new ApiError('SUBSCRIPTION_REQUIRED', 'An active subscription is required.', 402);
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new ApiError('INVALID_RESPONSE', 'JobGen returned an invalid response.');
    }
    const profileMismatch = status === 401 && String(url).endsWith('/jobgen_linkedin_data');
    if (data.status === 'error' || data.error || (status >= 400 && !profileMismatch)) {
      throw new ApiError('API_ERROR', 'JobGen could not complete this request.', status || undefined);
    }
    // Preserve legacy nested string-status contracts while accepting numeric codes.
    if (data?.response && typeof data.response.status === 'number') data.response.status = String(data.response.status);
    return { ok: response.ok, status: response.status, statusText: response.statusText,
      json: async () => data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(upstream?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT',
        upstream?.aborted ? 'Request cancelled.' : 'JobGen took too long to respond. Please try again.');
    }
    if (error instanceof SyntaxError) throw new ApiError('INVALID_RESPONSE', 'JobGen returned an invalid response.');
    throw new ApiError('NETWORK_ERROR', 'Could not reach JobGen. Please try again.');
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', onAbort);
  }
}
