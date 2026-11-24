import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { broadcastAutofill } from '../src/background/autofillBroadcast.js';
import { submitSeekApplication } from '../src/utils/seekSubmission.js';

let server, dom;
const storage = {};
const nativeFetch = globalThis.fetch;
before(async () => {
  dom = new JSDOM('<body></body>', { url: 'https://www.linkedin.com/jobs/view/123', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'location', 'history', 'Event', 'CustomEvent', 'MutationObserver', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'MouseEvent', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 200, height: 100, top: 0, left: 0, bottom: 100, right: 200 });
  globalThis.fetch = async () => { throw new Error('Network access is disabled in regression tests'); };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.chrome = {
    runtime: { getURL: path => path },
    storage: { local: {
      get(keys, callback) {
        const result = keys === null ? { ...storage } : Object.fromEntries(keys.map(key => [key, storage[key]]));
        if (callback) callback(result);
        else return Promise.resolve(result);
      },
      set(data, callback) { Object.assign(storage, data); callback?.(); return Promise.resolve(); },
      remove(keys, callback) { keys.forEach(key => delete storage[key]); callback?.(); return Promise.resolve(); }
    }}
  };
  server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom',
    esbuild: { jsx: 'automatic' } });
});
let pageSequence=1000;
beforeEach(()=>dom.reconfigure({url:`https://www.linkedin.com/jobs/view/${pageSequence++}`}));
after(async () => { await server?.close(); dom?.window.close(); globalThis.fetch = nativeFetch; });

function fakeChrome(frames, accepted = [0]) {
  const calls = [];
  const api = {
    runtime: {},
    webNavigation: { getAllFrames({ tabId }, callback) { calls.push(['enumerate', tabId]); callback(frames); } },
    tabs: { sendMessage(tabId, message, options, callback) {
      calls.push(['send', tabId, options.frameId, message.data.action]);
      api.runtime.lastError = accepted.includes(options.frameId) ? undefined : { message: 'No receiver' };
      callback(accepted.includes(options.frameId) ? { success: true } : undefined);
      api.runtime.lastError = undefined;
    }}
  };
  return { api, calls };
}

test('autofill stays in the requesting tab and contacts each frame once', async () => {
  const { api, calls } = fakeChrome([{ frameId: 0 }, { frameId: 7 }, { frameId: 7 }]);
  const result = await broadcastAutofill({ action: 'autofill' }, { tab: { id: 42 } }, api);
  assert.equal(result.success, true);
  assert.equal(result.framesAcknowledged, 1);
  assert.deepEqual(calls, [['enumerate', 42], ['send', 42, 0, 'autofill'], ['send', 42, 7, 'autofill']]);
});

test('autofill reports missing sender, empty frames, unsupported actions and no receivers', async () => {
  const { api, calls } = fakeChrome([]);
  assert.equal((await broadcastAutofill({ action: 'apply' }, {}, api)).success, false);
  assert.equal((await broadcastAutofill({}, { tab: { id: 1 } }, api)).success, false);
  assert.equal(calls.length, 0);
  assert.equal((await broadcastAutofill({ action: 'apply' }, { tab: { id: 1 } }, api)).success, false);
  const unavailable = fakeChrome([{ frameId: 0 }], []);
  assert.equal((await broadcastAutofill({ action: 'apply' }, { tab: { id: 1 } }, unavailable.api)).success, false);
});

test('frame enumeration errors are reported without dispatching', async () => {
  const { api, calls } = fakeChrome([]);
  api.webNavigation.getAllFrames = (_, callback) => {
    api.runtime.lastError = { message: 'Tab closed' }; callback(); api.runtime.lastError = undefined;
  };
  assert.deepEqual(await broadcastAutofill({ action: 'apply' }, { tab: { id: 42 } }, api),
    { success: false, error: 'Tab closed' });
  assert.equal(calls.length, 0);
});

test('SEEK waits for confirmation and deduplicates simultaneous clicks', async () => {
  document.body.innerHTML = '<button>Submit</button>';
  const button = document.querySelector('button');
  let clicks = 0, resolved = false;
  button.onclick = () => { clicks++; };
  const pending = submitSeekApplication(button, { timeoutMs: 200 });
  assert.equal(submitSeekApplication(button), pending);
  pending.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(clicks, 1);
  document.body.insertAdjacentHTML('beforeend', '<div id="applicationSent">Application sent</div>');
  await pending;
  assert.equal(resolved, true);
});

test('SEEK validation/no confirmation does not report success', async () => {
  document.body.innerHTML = '<button>Submit</button><div role="alert">Required field missing</div>';
  await assert.rejects(submitSeekApplication(document.querySelector('button'), { timeoutMs: 10 }), { code: 'VALIDATION_ERROR' });
  document.querySelector('[role=alert]').remove();
  document.querySelector('button').disabled = true;
  await assert.rejects(submitSeekApplication(document.querySelector('button')), /unavailable/);
  await assert.rejects(submitSeekApplication(null), /unavailable/);
});

test('Indeed fallback uses the current FAQ email and fills the answer', async () => {
  const { answerWithInfoMapping } = await server.ssrLoadModule('/src/autofill/indeed.js');
  document.body.innerHTML = '<input aria-label="Preferred office ambience">';
  storage.user_faq_data = { personal_info: JSON.stringify({ email: ' person@example.com ' }) };
  storage.jobgen_session_token = 'fixture-token';
  storage.user_faq_session = 'fixture-token';
  storage.user_faq_timestamp = Date.now();
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ answer: 'Quiet' }) };
  };
  try {
    assert.equal(await answerWithInfoMapping(document.querySelector('input')), true);
    assert.equal(document.querySelector('input').value, 'Quiet');
    assert.equal(payload.email, 'person@example.com');
  } finally { globalThis.fetch = originalFetch; }
});

test('LinkedIn education creates and fills a missing card', async () => {
  const { fillSingleEducation } = await server.ssrLoadModule('/src/autofill/linkedin.js');
  document.body.innerHTML = '<section><button>Add more</button><div class="jobs-easy-apply-repeatable-groupings__groupings"></div></section>';
  document.querySelector('button').onclick = () => {
    document.querySelector('.jobs-easy-apply-repeatable-groupings__groupings').innerHTML =
      '<div class="artdeco-card"><input type="text"><input type="text"><input type="text"><input type="text"></div>';
  };
  await fillSingleEducation(document.querySelector('section'), { institute: 'Example University', degree: 'Computing' }, 0);
  assert.equal(document.querySelector('input').value, 'Example University');
  assert.equal(document.querySelectorAll('input')[2].value, 'Computing');
});

test('action buttons survive authentication toggling without changing hook order', async () => {
  const { default: ActionButtons } = await server.ssrLoadModule('/src/components/ActionButtons.jsx');
  const bridge = await server.ssrLoadModule('/src/utils/actionButtonsBridge.js');
  document.body.innerHTML = '<div id="test-root"></div>';
  const root = createRoot(document.querySelector('#test-root'));
  await act(async () => { root.render(React.createElement(ActionButtons, {})); });
  assert.equal(document.querySelector('.jg-actions'), null);
  await act(async () => { bridge.updateActionButtonState({ isAuthenticated: true }); });
  assert.ok(document.querySelector('.jg-actions'));
  await act(async () => { bridge.updateActionButtonState({ isAuthenticated: false }); });
  assert.equal(document.querySelector('.jg-actions'), null);
  await act(async () => root.unmount());
});

test('LinkedIn success at modal dismissal is dispatched once across both monitors', async () => {
  storage.jobgen_session_token = '';
  const helpers = await server.ssrLoadModule('/src/utils/linkedinHelpers.js');
  document.body.innerHTML = '<div class="jobs-easy-apply-modal" role="dialog"><div class="jobs-easy-apply-modal__content"><button aria-label="Submit application">Submit</button></div></div>';
  const monitor = helpers.createEasyApplyModalMonitor();
  const notified = [];
  const unsubscribe = helpers.subscribeToSubmissionSuccess(modal => notified.push(modal));
  try {
    await monitor.start();
    const aborted = monitor.waitForAbort().catch(() => {});
    document.querySelector('.jobs-easy-apply-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-labelledby="post-apply-modal"><h2 id="post-apply-modal">Application sent</h2></div>');
    await new Promise(resolve => setTimeout(resolve, 0));
    await aborted;
    helpers.ensureLinkedInSubmissionMonitor();
    assert.equal(notified.length, 1);
    document.querySelector('h2').append('!');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(notified.length, 1);
  } finally {
    monitor.stop(); helpers.stopLinkedInSubmissionMonitor(); unsubscribe();
  }
});

test('LinkedIn submit followed by dismissal without confirmation stays unconfirmed', async () => {
  storage.jobgen_session_token = '';
  const helpers = await server.ssrLoadModule('/src/utils/linkedinHelpers.js');
  document.body.innerHTML = '<div class="jobs-easy-apply-modal" role="dialog"><div class="jobs-easy-apply-modal__content"><button aria-label="Submit application">Submit</button></div></div>';
  const events = [];
  const onProgress = event => events.push(event.detail);
  window.addEventListener('jobgen-progress-event', onProgress);
  const monitor = helpers.createEasyApplyModalMonitor();
  try {
    await monitor.start();
    const aborted = monitor.waitForAbort().catch(() => {});
    document.querySelector('button').click();
    document.querySelector('.jobs-easy-apply-modal').remove();
    await aborted;
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.equal(events.some(event => event.action === 'submitted'), false);
    assert.ok(events.some(event => event.type === 'error' && /could not be confirmed/.test(event.message)));
  } finally { monitor.stop(); window.removeEventListener('jobgen-progress-event', onProgress); }
});

test('manual SEEK autofill stops at review without clicking Submit', async () => {
  const { autofillSeek } = await server.ssrLoadModule('/src/autofill/seek_autodill.js');
  dom.reconfigure({ url: 'https://www.seek.com.au/job/123/apply/review' });
  document.body.innerHTML = '<div aria-current="step">Review and submit</div><button data-testid="review-submit-application">Submit</button>';
  document.querySelector('[aria-current]').innerText = 'Review and submit';
  storage.seek_job_123 = { jobId: '123' };
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const events = [];
  const handler = event => events.push(event.detail);
  window.addEventListener('jobgen-progress-event', handler);
  try {
    await autofillSeek();
    assert.equal(clicks, 0);
    assert.equal(events.some(event => event.action === 'submitted'), false);
    assert.ok(events.some(event => /Review your application/.test(event.message || '')));
  } finally {
    window.removeEventListener('jobgen-progress-event', handler);
    dom.reconfigure({ url: 'https://www.linkedin.com/jobs/view/123' });
  }
});

test('late LinkedIn confirmation does not turn into an error after its modal closes', async () => {
  const helpers = await server.ssrLoadModule('/src/utils/linkedinHelpers.js');
  document.body.innerHTML = '<div class="jobs-easy-apply-modal" role="dialog"><div class="jobs-easy-apply-modal__content"><button aria-label="Submit application">Submit</button></div></div>';
  const events = [];
  const handler = event => events.push(event.detail);
  window.addEventListener('jobgen-progress-event', handler);
  const monitor = helpers.createEasyApplyModalMonitor();
  try {
    await monitor.start();
    const aborted = monitor.waitForAbort().catch(() => {});
    document.querySelector('button').click();
    document.querySelector('.jobs-easy-apply-modal').remove();
    await aborted;
    helpers.ensureLinkedInSubmissionMonitor();
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-labelledby="post-apply-modal"><h2 id="post-apply-modal">Application sent</h2></div>');
    await new Promise(resolve => setTimeout(resolve, 0));
    document.body.innerHTML = '';
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.equal(events.filter(event => event.action === 'submitted').length, 1);
    assert.equal(events.some(event => event.type === 'error'), false);
  } finally {
    monitor.stop(); helpers.stopLinkedInSubmissionMonitor();
    window.removeEventListener('jobgen-progress-event', handler);
  }
});

test('Glassdoor/iCIMS standard controls fill mapped answers and preserve existing input', async () => {
  const { autofillStandardForm } = await server.ssrLoadModule('/src/autofill/standardForm.js');
  document.body.innerHTML = `<form>
    <label>Email<input name="email" type="email"></label>
    <label>Existing answer<input name="existing" value="My own answer"></label>
    <label>Location<select name="location"><option value="">Choose</option><option value="syd">Sydney</option></select></label>
    <label><input type="checkbox" name="consent">Accept optional contact</label>
    <input type="password" name="password"><input type="file" name="resume">
    <input hidden name="hidden"><button type="submit">Submit</button>
  </form>`;
  let submits = 0;
  document.querySelector('form').onsubmit = event => { event.preventDefault(); submits++; };
  const result = await autofillStandardForm('glassdoor', { mapQuestion: async ({ question }) => {
    if (/Email/.test(question)) return { answer: 'person@example.com' };
    if (/Location/.test(question)) return { answer: 'Sydney' };
    if (/Accept/.test(question)) return { answer: 'no' };
    throw new Error('Unknown question');
  }});
  assert.equal(document.querySelector('[name=email]').value, 'person@example.com');
  assert.equal(document.querySelector('[name=location]').value, 'syd');
  assert.equal(document.querySelector('[name=existing]').value, 'My own answer');
  assert.equal(document.querySelector('[name=consent]').checked, false);
  assert.equal(document.querySelector('[name=password]').value, '');
  assert.equal(result.filled, 2);
  assert.equal(result.submitted, false);
  assert.equal(submits, 0);
});

test('radio autofill respects a previous user choice', async () => {
  const { autofillStandardForm } = await server.ssrLoadModule('/src/autofill/standardForm.js');
  document.body.innerHTML = '<fieldset><legend>Work mode</legend><label><input type="radio" name="mode" value="remote" checked>Remote</label><label><input type="radio" name="mode" value="office">Office</label></fieldset>';
  await autofillStandardForm('icims', { mapQuestion: async () => ({ answer: 'office' }) });
  assert.equal(document.querySelector('[value=remote]').checked, true);
});

test('subscription checks without an endpoint never create a dummy application', async () => {
  const api = await server.ssrLoadModule('/src/services/apiService.js');
  storage.jobgen_session_token = 'fixture-token';
  const result = await api.checkUserSubscriptionStatus();
  assert.equal(result.subscribed, null);
  assert.equal(result.error, 'SUBSCRIPTION_CHECK_UNAVAILABLE');
});

test('platform controls expose auto-apply only where a continuous adapter exists', async () => {
  const { platformCapabilities } = await server.ssrLoadModule('/src/utils/platformCapabilities.js');
  for (const site of ['linkedin', 'indeed', 'seek']) assert.equal(platformCapabilities(site).autoApply, true);
  for (const site of ['glassdoor', 'microsoft', 'icims']) {
    assert.equal(platformCapabilities(site).autoApply, false);
    assert.equal(platformCapabilities(site).autofill, true);
  }
  assert.equal(platformCapabilities('unknown').autofill, false);
});

test('job extractors keep LinkedIn and Indeed identities separate across navigation', async () => {
  const { LinkedInExtractor, IndeedExtractor } = await server.ssrLoadModule('/src/utils/siteExtractors.js');
  assert.equal(LinkedInExtractor.getJobIdFromUrl('https://www.linkedin.com/jobs/view/12345678'), '12345678');
  assert.equal(LinkedInExtractor.getJobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=87654321'), '87654321');
  assert.equal(IndeedExtractor.getJobIdFromUrl('https://au.indeed.com/viewjob?jk=first'), 'first');
  assert.equal(IndeedExtractor.getJobIdFromUrl('https://au.indeed.com/jobs?vjk=second'), 'second');
});

test('Indeed DOM fixture extracts the selected job details', async () => {
  const { IndeedExtractor } = await server.ssrLoadModule('/src/utils/siteExtractors.js');
  dom.reconfigure({ url: 'https://au.indeed.com/viewjob?jk=fixture-job' });
  document.body.innerHTML = '<h1 data-testid="jobsearch-JobInfoHeader-title">Engineer</h1><div data-testid="inlineHeader-companyName"><a>Example</a></div><div data-testid="inlineHeader-companyLocation"><div>Sydney</div></div>';
  for (const element of document.querySelectorAll('h1, a, [data-testid="inlineHeader-companyLocation"] div')) element.innerText = element.textContent;
  try {
    const job = await IndeedExtractor.extractJobInfo();
    assert.equal(job.jobId, 'fixture-job');
    assert.equal(job.jobTitle, 'Engineer');
    assert.equal(job.companyName, 'Example');
    assert.equal(job.jobLocation, 'Sydney');
  } finally { dom.reconfigure({ url: 'https://www.linkedin.com/jobs/view/123' }); }
});

test('SEEK DOM fixture extracts selected identity and job description', async () => {
  const { SeekExtractor } = await server.ssrLoadModule('/src/utils/siteExtractors.js');
  dom.reconfigure({ url: 'https://www.seek.com.au/job/123' });
  document.body.innerHTML = '<h1 data-automation="job-detail-title">Engineer</h1><span data-automation="advertiser-name">Example</span><span data-automation="job-detail-location">Sydney</span><div data-automation="jobAdDetails">Build useful software</div>';
  for (const element of document.querySelectorAll('h1, span, [data-automation="jobAdDetails"]')) element.innerText = element.textContent;
  try {
    assert.equal(SeekExtractor.getCurrentJobIdentifier(), '123');
    const job = await SeekExtractor.extractJobInfo();
    assert.equal(job.jobTitle, 'Engineer');
    assert.equal(job.companyName, 'Example');
    assert.equal(await SeekExtractor.getJobDescription(), 'Build useful software');
  } finally { dom.reconfigure({ url: 'https://www.linkedin.com/jobs/view/123' }); }
});

test('Microsoft does not send invalid document requests from a form without job context', async () => {
  const { MicrosoftAutofill } = await server.ssrLoadModule('/src/autofill/microsoft.js');
  document.body.innerHTML = '<h1>Profile</h1>';
  const result = await new MicrosoftAutofill().getResumeAndCoverLetter();
  assert.deepEqual(result, { resumeContent: null, coverLetterURL: null });
});

test('Microsoft document requests use the job identity and available description', async () => {
  const { MicrosoftAutofill } = await server.ssrLoadModule('/src/autofill/microsoft.js');
  dom.reconfigure({ url: 'https://jobs.careers.microsoft.com/global/en/job/123/application' });
  document.body.innerHTML = '<h1>Engineer</h1><div data-testid="job-description">Build useful software</div>';
  storage.jobgen_session_token = 'fixture-token';
  const previousFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ status: 'success', response: { resume: 'https://example.test/resume.pdf' } }) };
  };
  try {
    const result = await new MicrosoftAutofill().getResumeAndCoverLetter();
    assert.equal(payload.job_id, '123');
    assert.equal(payload.description, 'Build useful software');
    assert.equal(result.resumeContent, 'https://example.test/resume.pdf');
  } finally {
    globalThis.fetch = previousFetch;
    dom.reconfigure({ url: 'https://www.linkedin.com/jobs/view/123' });
  }
});

test('LinkedIn rechecks fields after its click delay and stops on a late validation error', async () => {
  const { clickNextButton } = await server.ssrLoadModule('/src/autofill/linkedin.js');
  document.body.innerHTML='<div role="dialog"><input><button type="button" data-easy-apply-next-button>Continue</button></div>';
  const modal=document.querySelector('[role=dialog]');let clicks=0;
  document.querySelector('button').onclick=()=>clicks++;
  setTimeout(()=>document.querySelector('input').setAttribute('aria-invalid','true'),20);
  await assert.rejects(clickNextButton(modal),{code:'VALIDATION_ERROR'});
  assert.equal(clicks,0);
});

test('LinkedIn cannot click a form dismissed during the delay', async () => {
  const { clickNextButton } = await server.ssrLoadModule('/src/autofill/linkedin.js');
  document.body.innerHTML='<div role="dialog"><button type="button" data-easy-apply-next-button>Continue</button></div>';
  const modal=document.querySelector('[role=dialog]');let clicks=0;
  document.querySelector('button').onclick=()=>clicks++;
  setTimeout(()=>modal.remove(),20);
  await assert.rejects(clickNextButton(modal),{code:'CLOSED_FORM'});
  assert.equal(clicks,0);
});

test('a LinkedIn submit control is not automatically clicked twice while awaiting confirmation', async () => {
  const { clickNextButton } = await server.ssrLoadModule('/src/autofill/linkedin.js');
  document.body.innerHTML='<div role="dialog"><button type="button" aria-label="Submit application">Submit</button></div>';
  const modal=document.querySelector('[role=dialog]');let clicks=0;
  document.querySelector('button').onclick=()=>clicks++;
  await clickNextButton(modal);
  await assert.rejects(clickNextButton(modal),{code:'NO_TRANSITION'});
  assert.equal(clicks,1);
});

test('Indeed unknown steps stop instead of generically clicking Continue', async () => {
  const { runFullApplyFlow } = await server.ssrLoadModule('/src/autofill/indeed.js');
  document.body.innerHTML='<button type="button">Continue</button>';let clicks=0;
  document.querySelector('button').onclick=()=>clicks++;
  const events=[];const handler=e=>events.push(e.detail);
  window.addEventListener('jobgen-progress-event',handler);
  try {
    await runFullApplyFlow();
    assert.equal(clicks,0);
    assert.ok(events.some(event=>event.type==='error'&&/not recognised/.test(event.message)));
  } finally {window.removeEventListener('jobgen-progress-event',handler);}
});

test('Indeed generic advance excludes final Submit controls and validates required fields', async () => {
  const { clickPrimary } = await server.ssrLoadModule('/src/autofill/indeed.js');
  document.body.innerHTML='<form><input required><button type="button">Continue</button><button type="button">Submit application</button></form>';
  document.querySelectorAll('button').forEach(button=>{button.innerText=button.textContent;});
  let clicks=0;document.querySelector('button').onclick=()=>clicks++;
  await assert.rejects(clickPrimary('Continue from panel'),{code:'INCOMPLETE_FIELDS'});
  assert.equal(clicks,0);
  document.querySelector('button').remove();
  assert.equal(await clickPrimary('Generic continue'),false);
});

test('SEEK next waits for a ready form and propagates a stop without clicking', async () => {
  const { clickNextButton } = await server.ssrLoadModule('/src/utils/seekHelpers.js');
  document.body.innerHTML='<form><input required><button type="button" data-testid="continue-button">Continue</button></form>';
  let clicks=0;document.querySelector('button').onclick=()=>clicks++;
  await assert.rejects(clickNextButton(),{code:'INCOMPLETE_FIELDS'});
  document.querySelector('input').value='Filled';
  await clickNextButton();
  assert.equal(clicks,1);
});

test('failed document download is rejected before assigning a file', async () => {
  const { uploadFromUrl } = await server.ssrLoadModule('/src/autofill/indeed.js');
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:503});
  try {assert.equal(await uploadFromUrl('https://example.test/failed.pdf'),false);}
  finally {globalThis.fetch=previousFetch;}
});

test('Indeed cannot click after navigation to another job during its delay', async () => {
  const { clickPrimary } = await server.ssrLoadModule('/src/autofill/indeed.js');
  document.body.innerHTML='<form><button type="button">Continue</button></form>';
  const button=document.querySelector('button');button.innerText='Continue';let clicks=0;button.onclick=()=>clicks++;
  const previousUrl=window.location.href;
  setTimeout(()=>dom.reconfigure({url:'https://www.linkedin.com/jobs/view/999'}),20);
  try {
    await assert.rejects(clickPrimary('Continue from panel'),{code:'CANCELLED'});
    assert.equal(clicks,0);
  } finally {dom.reconfigure({url:previousUrl});}
});

test('SEEK cannot automatically re-click an unconfirmed submission after timeout', async () => {
  document.body.innerHTML='<form><button type="button">Submit</button></form>';
  const button=document.querySelector('button');let clicks=0;button.onclick=()=>clicks++;
  await assert.rejects(submitSeekApplication(button,{timeoutMs:10}),/could not be confirmed/);
  await assert.rejects(submitSeekApplication(button,{timeoutMs:10}),/could not be confirmed/);
  assert.equal(clicks,1);
});

test('SEEK saved career data cannot be deleted by an unconfirmed helper call',async()=>{
 const { deleteSeekCareerCard }=await server.ssrLoadModule('/src/utils/seekHelpers.js');
 document.body.innerHTML='<article><button>Edit</button></article>';let clicks=0;
 const button=document.querySelector('button');button.onclick=()=>clicks++;
 await assert.rejects(deleteSeekCareerCard({card:document.querySelector('article'),editButton:button}),{code:'MANUAL_REVIEW_REQUIRED'});
 assert.equal(clicks,0);
});

test('SEEK resume-capacity cleanup requires review before deleting any saved documents',async()=>{
 const { deleteResumesUntilUnderLimit }=await server.ssrLoadModule('/src/utils/seekHelpers.js');
 document.body.innerHTML='<select>'+Array.from({length:10},(_,index)=>`<option value="${index}">Saved document</option>`).join('')+'</select><button data-testid="upload-button">Upload</button>';
 let clicks=0;document.querySelector('button').onclick=()=>clicks++;
 await assert.rejects(deleteResumesUntilUnderLimit(),{code:'MANUAL_REVIEW_REQUIRED'});
 assert.equal(clicks,0);
});

test('Microsoft upload helper cannot click a generic final-submit button',async()=>{
 const { MicrosoftAutofill }=await server.ssrLoadModule('/src/autofill/microsoft.js');
 document.body.innerHTML='<input id="uploadfiles" type="file" data-testid="inputFiles"><button type="submit">Submit application</button>';
 let clicks=0;document.querySelector('button').onclick=event=>{event.preventDefault();clicks++;};
 Object.defineProperty(document.querySelector('input'),'files',{writable:true,value:[]});
 const previousFetch=globalThis.fetch, previousTransfer=globalThis.DataTransfer;
 globalThis.fetch=async()=>new Response('%PDF-1.7\nfixture');
 globalThis.DataTransfer=class { constructor(){this.files=[];this.items={add:file=>this.files.push(file)};} };
 try {
  await new MicrosoftAutofill().uploadResume('https://example.test/resume.pdf');
  assert.equal(document.querySelector('input').files.length,1);
  assert.equal(clicks,0);
 } finally {globalThis.fetch=previousFetch;globalThis.DataTransfer=previousTransfer;}
});

test('Microsoft privacy helper preserves user consent choices',async()=>{
 const { MicrosoftAutofill }=await server.ssrLoadModule('/src/autofill/microsoft.js');
 document.body.innerHTML='<label class="ms-Checkbox-label" for="consent"><input id="consent" type="checkbox"><span class="ms-Checkbox-checkbox"></span>Consent</label>';
 await new MicrosoftAutofill().handlePrivacyCheckboxes();
 assert.equal(document.querySelector('input').checked,false);
});

test('Microsoft upload errors remain visible and are reported rather than dismissed',async()=>{
 const { MicrosoftAutofill }=await server.ssrLoadModule('/src/autofill/microsoft.js');
 document.body.innerHTML='<div role="alert">Duplicate file</div><button aria-label="Close popup modal">Close</button>';
 let clicks=0;document.querySelector('button').onclick=()=>clicks++;
 await assert.rejects(new MicrosoftAutofill().handleResumeUploadErrors(),{code:'UPLOAD_FAILED'});
 assert.equal(clicks,0);
});
