import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch } from '../src/services/httpClient.js';
import { clearSession, getSessionToken, isExpiredToken, setSessionToken } from '../src/services/session.js';

const nativeFetch = globalThis.fetch;
let stored;
const jwt = exp => `header.${btoa(JSON.stringify({ exp }))}.signature`;
beforeEach(() => {
  stored = { jobgen_session_token: 'account-a', user_faq_data: { name: 'Alice' }, seek_job_123: { title: 'Private' } };
  globalThis.chrome = { runtime: {}, storage: { local: {
    get(keys, callback) { callback(keys === null ? { ...stored } : Object.fromEntries(keys.map(key => [key, stored[key]]))); },
    set(values) { Object.assign(stored, values); return Promise.resolve(); },
    remove(keys, callback) { keys.forEach(key => delete stored[key]); callback?.(); }
  }}};
  globalThis.fetch = async () => { throw new Error('Unexpected network call in test'); };
});
after(() => { globalThis.fetch = nativeFetch; });

const authenticated = { headers: { Authorization: 'Bearer account-a' } };

test('expired/malformed JWTs are rejected while opaque sessions remain server-validated', async () => {
  assert.equal(isExpiredToken(jwt(Date.now() / 1000 - 1)), true);
  assert.equal(isExpiredToken(jwt(Date.now() / 1000 + 1000)), false);
  assert.equal(isExpiredToken('bad.token.value'), true);
  assert.equal(isExpiredToken('opaque-session'), false);
  stored.jobgen_session_token = jwt(1);
  assert.equal(await getSessionToken(), null);
  assert.deepEqual(stored, {});
});

test('account changes clear cached profile and job data', async () => {
  assert.equal(await setSessionToken('account-b'), true);
  assert.deepEqual(stored, { jobgen_session_token: 'account-b' });
  assert.equal(await clearSession('account-a'), false);
  assert.equal(await getSessionToken(), 'account-b');
});

test('an expired replacement cannot overwrite a valid session', async () => {
  assert.equal(await setSessionToken(jwt(1)), false);
  assert.equal(await getSessionToken(), 'account-a');
});

test('HTTP auth failures clear user data even when the response is not JSON', async () => {
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'TOKEN_INVALID' });
  assert.deepEqual(stored, {});
});

test('a stale auth failure cannot sign out another account', async () => {
  globalThis.fetch = async () => {
    await setSessionToken('account-b');
    return new Response('Forbidden', { status: 403 });
  };
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'TOKEN_INVALID' });
  assert.equal(await getSessionToken(), 'account-b');
});

test('a successful response from an old account is discarded', async () => {
  globalThis.fetch = async () => {
    await setSessionToken('account-b');
    return Response.json({ response: { status: '200', personal_info: 'Alice' } });
  };
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'SESSION_CHANGED' });
});

test('numeric and error-field nested auth failures invalidate the session', async () => {
  for (const response of [{ status: 403 }, { error: '403' }]) {
    stored.jobgen_session_token = 'account-a';
    globalThis.fetch = async () => Response.json({ response });
    await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'TOKEN_INVALID' });
    assert.deepEqual(stored, {});
  }
});

test('LinkedIn profile mismatch remains distinguishable from expired authentication', async () => {
  globalThis.fetch = async () => Response.json({ response: { status: 401 } });
  const response = await apiFetch('https://candidates.jobgen.ai/api/1.1/wf/jobgen_linkedin_data', authenticated);
  assert.equal((await response.json()).response.status, '401');
  assert.equal(await getSessionToken(), 'account-a');
});

test('subscription refusal is reported without logging out', async () => {
  globalThis.fetch = async () => new Response('', { status: 402 });
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.equal(await getSessionToken(), 'account-a');
});

test('malformed responses and server failures have distinct recoverable errors', async () => {
  globalThis.fetch = async () => new Response('not json');
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api'), { code: 'INVALID_RESPONSE' });
  globalThis.fetch = async () => new Response('server error', { status: 500 });
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api'), { code: 'HTTP_ERROR', status: 500 });
});

test('slow requests time out without automatic POST retries', async () => {
  let calls = 0;
  globalThis.fetch = async (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  };
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', { method: 'POST', timeoutMs: 10 }), { code: 'REQUEST_TIMEOUT' });
  assert.equal(calls, 1);
});

test('timeouts include reading a slow response body', async () => {
  globalThis.fetch = async (_, { signal }) => ({ ok: true, status: 200,
    json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) });
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', { timeoutMs: 10 }), { code: 'REQUEST_TIMEOUT' });
});

test('caller cancellation is distinct from timeout', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const request = apiFetch('https://candidates.jobgen.ai/api', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: 'REQUEST_CANCELLED' });
});

test('API-level errors cannot be mistaken for successful saves', async () => {
  globalThis.fetch = async () => Response.json({ status: 'error', message: 'Rejected' });
  await assert.rejects(apiFetch('https://candidates.jobgen.ai/api', authenticated), { code: 'API_ERROR' });
});

test('numeric success statuses are normalised for existing Bubble callers', async () => {
  globalThis.fetch = async () => Response.json({ status: 'success', response: { status: 200 } });
  const result = await apiFetch('https://candidates.jobgen.ai/api', authenticated);
  assert.equal((await result.json()).response.status, '200');
});

test('FAQ caches belong to one account and unowned legacy caches are refreshed', async () => {
  const { getStoredFAQData } = await import('../src/services/apiService.js');
  globalThis.fetch = async () => Response.json({ status: 'success', response: { status: 200, personal_info: { email: 'new@example.com' } } });
  const result = await getStoredFAQData();
  assert.equal(result.personal_info.email, 'new@example.com');
  assert.equal(stored.user_faq_session, 'account-a');
});

test('matching, generated documents, saves and outcomes use the expected client contracts', async () => {
  const api = await import('../src/services/apiService.js');
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, authorization: options.headers.Authorization });
    if (url.endsWith('jobgen_job_match')) return Response.json({ status: 'success', response: {
      job_id: body.job_id, job_data: '{"score":80}', job_found: true } });
    if (url.endsWith('jobgen_apply')) return Response.json({ status: 'success', response: {
      resume: 'https://files.example.test/resume.pdf', cover_letter: 'https://files.example.test/letter.pdf', job_id: body.job_id } });
    return Response.json({ status: 'success', job_id: body.job_id });
  };
  const job = { job_id: '123', description: 'Test role', company: 'Example', job_title: 'Engineer', job_portal: 'SEEK', job_url: 'https://www.seek.com.au/job/123' };
  assert.equal((await api.getJobMatch(job)).success, true);
  const document = await api.submitJobApplication({ ...job, job_url_id: job.job_id, cover_letter: 'yes' });
  assert.equal(document.success, true);
  assert.match(document.resume, /resume.pdf$/);
  assert.equal((await api.saveJob(job)).success, true);
  assert.equal((await api.submitJobApplicationOutcome({ ...job, application_status: 'Applied' })).success, true);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.authorization === 'Bearer account-a'));
  assert.equal(calls[1].body.updated_resume, 'no');
  assert.equal(calls[3].body.application_status, 'Applied');
});

test('a mismatched match response is rejected rather than shown for another job', async () => {
  const api = await import('../src/services/apiService.js');
  globalThis.fetch = async () => Response.json({ status: 'success', response: { job_id: 'other-job', job_data: '{}' } });
  const result = await api.getJobMatch({ job_id: '123', description: 'Test', company: 'Example', job_title: 'Engineer', job_portal: 'SEEK' });
  assert.equal(result.error, 'JOB_ID_MISMATCH');
});

test('unsupported headshot styles fail before any image or generation request', async () => {
  const { generateProfileHeadshots } = await import('../src/services/apiService.js');
  assert.deepEqual(await generateProfileHeadshots({ imageUrl: 'https://example.test/photo.jpg', style_option: 'Unknown' }), { error: 'INVALID_STYLE' });
});
