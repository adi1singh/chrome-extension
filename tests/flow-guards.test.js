import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { assertCanAdvance, assertFormReady, clearFlowDiagnostics, readFlowDiagnostics, FlowStop, waitForUploadReady, prepareTransitionWait, claimSubmissionAttempt } from '../src/utils/flowGuard.js';

const fixture = name => readFile(new URL(`./fixtures/flows/${name}.html`, import.meta.url), 'utf8');
let dom;
afterEach(() => { dom?.window.close(); clearFlowDiagnostics(); });
function load(html) { dom = new JSDOM(html); return dom.window.document; }

test('incomplete questions stop, completed fields permit advancement', async () => {
  const doc = load(await fixture('questions'));
  const button = doc.querySelector('button');
  assert.throws(() => assertCanAdvance(doc, button, { site: 'seek' }), { code: 'INCOMPLETE_FIELDS' });
  doc.querySelector('select').value = 'yes';
  assert.equal(assertCanAdvance(doc, button, { site: 'seek' }), true);
});

test('hidden errors and extension-owned progress do not block a valid host form', async () => {
  const doc = load(await fixture('review'));
  doc.body.insertAdjacentHTML('beforeend', '<div id="jobgen-react-app"><div role="progressbar"></div><input required></div>');
  assert.equal(assertCanAdvance(doc, doc.querySelector('button'), { site: 'seek' }), true);
  doc.querySelector('[role=alert]').hidden = false;
  assert.throws(() => assertCanAdvance(doc, doc.querySelector('button'), { site: 'seek' }), { code: 'VALIDATION_ERROR' });
});

test('disabled, aria-disabled, hidden and missing controls cannot advance', () => {
  const doc = load('<form><button>Continue</button></form>');
  const button = doc.querySelector('button');
  for (const mutate of [() => {button.disabled=true;}, () => {button.disabled=false;button.setAttribute('aria-disabled','true');}, () => {button.removeAttribute('aria-disabled');button.hidden=true;}]) {
    mutate(); assert.throws(() => assertCanAdvance(doc,button,{site:'indeed'}),{code:'UNAVAILABLE_CONTROL'});
  }
  assert.throws(() => assertCanAdvance(doc,null,{site:'indeed'}),{code:'MISSING_CONTROL'});
});

test('closed/replaced forms and cancelled operations stop before clicking', () => {
  const doc = load('<form><button>Continue</button></form>');
  const form = doc.querySelector('form'), button = doc.querySelector('button');
  form.remove();
  assert.throws(() => assertCanAdvance(form,button,{site:'linkedin'}),{code:'CLOSED_FORM'});
  doc.body.append(form);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => assertCanAdvance(form,button,{site:'linkedin',signal:controller.signal}),{code:'CANCELLED'});
});

test('upload timeout stops instead of proceeding', async () => {
  const doc=load(await fixture('uploading'));
  await assert.rejects(waitForUploadReady(doc,{timeoutMs:20,intervalMs:5}),{code:'UPLOAD_TIMEOUT'});
  assert.deepEqual(readFlowDiagnostics().map(entry=>entry.code),['UPLOAD_TIMEOUT']);
});

test('a delayed upload can finish, but an upload error is not success', async () => {
  const doc=load(await fixture('uploading'));
  doc.querySelector('form').insertAdjacentHTML('beforeend','<input required>');
  setTimeout(()=>doc.querySelector('[role=progressbar]').remove(),15);
  assert.equal(await waitForUploadReady(doc,{timeoutMs:100,intervalMs:5}),true);
  assert.throws(()=>assertCanAdvance(doc,doc.querySelector('button'),{site:'seek'}),{code:'INCOMPLETE_FIELDS'});
  doc.querySelector('form').insertAdjacentHTML('beforeend','<div data-testid="upload-error">Failed private-document.pdf</div>');
  await assert.rejects(waitForUploadReady(doc,{timeoutMs:20}),{code:'VALIDATION_ERROR'});
});

test('upload wait reacts to interruption and root busy state', async () => {
  const doc=load('<form aria-busy="true"><button>Continue</button></form>');
  assert.throws(()=>assertFormReady(doc.querySelector('form'),{site:'seek'}),{code:'UPLOAD_PENDING'});
  const controller=new AbortController();
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(waitForUploadReady(doc,{timeoutMs:100,intervalMs:5,signal:controller.signal}),{code:'CANCELLED'});
});

test('diagnostics are bounded, allowlisted and do not include page contents', () => {
  const doc=load('<input required name="PRIVATE_NAME" value=""><span>PRIVATE TEXT</span>');
  for(let n=0;n<60;n++) {
    try {assertFormReady(doc,{site:'PRIVATE_SITE',step:'PRIVATE_STEP'});} catch { /* Expected stop. */ }
  }
  const rows=readFlowDiagnostics();
  assert.equal(rows.length,50);
  assert.deepEqual(Object.keys(rows[0]).sort(),['code','site','step','timestamp']);
  assert.equal(rows[0].site,'unknown');
  assert.equal(rows[0].step,'unknown');
  assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
  assert.equal(new FlowStop('seek','advance','PRIVATE_CODE').code,'UNKNOWN_STEP');
});

test('diagnostic events contain only safe metadata, not invalid answers or labels', () => {
  const doc=load('<label>PRIVATE QUESTION<input type="email" value="PRIVATE ANSWER" required></label>');
  const previousWindow=globalThis.window, previousEvent=globalThis.CustomEvent;
  globalThis.window=dom.window;globalThis.CustomEvent=dom.window.CustomEvent;
  const emitted=[];
  dom.window.addEventListener('jobgen-flow-diagnostic',event=>emitted.push(event.detail));
  try {
    assert.throws(()=>assertFormReady(doc,{site:'indeed',step:'advance'}),{code:'INCOMPLETE_FIELDS'});
    assert.equal(emitted.length,1);
    assert.equal(emitted[0].code,'INCOMPLETE_FIELDS');
    assert.equal(JSON.stringify(emitted).includes('PRIVATE'),false);
  } finally {globalThis.window=previousWindow;globalThis.CustomEvent=previousEvent;}
});

test('unchanged forms time out without another navigation click', async () => {
  const doc=load('<form><h2>Questions</h2><input><button>Next</button></form>');
  const wait=prepareTransitionWait(doc.querySelector('form'),()=>doc.querySelector('h2').textContent,{site:'linkedin',timeoutMs:20,intervalMs:5});
  await assert.rejects(wait(),{code:'NO_TRANSITION'});
});

test('delayed field replacement is recognised as a transition', async () => {
  const doc=load('<form><input></form>');
  const wait=prepareTransitionWait(doc.querySelector('form'),()=>'',{site:'linkedin',timeoutMs:100,intervalMs:5});
  setTimeout(()=>doc.querySelector('input').replaceWith(doc.createElement('textarea')),15);
  assert.equal(await wait(),true);
});

test('late validation stops a transition wait rather than retrying', async () => {
  const doc=load('<form><input></form>');
  const wait=prepareTransitionWait(doc.querySelector('form'),()=>'',{site:'linkedin',timeoutMs:100,intervalMs:5});
  setTimeout(()=>doc.querySelector('input').setAttribute('aria-invalid','true'),10);
  await assert.rejects(wait(),{code:'VALIDATION_ERROR'});
});

test('transition waits honour interruption', async () => {
  const doc=load('<form></form>');const controller=new AbortController();
  const wait=prepareTransitionWait(doc.querySelector('form'),()=>'',{site:'linkedin',timeoutMs:100,intervalMs:5,signal:controller.signal});
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(wait(),{code:'CANCELLED'});
});

test('identical React field replacement is not proof of advancing a step', async () => {
  const doc=load('<form><input name="answer"></form>');
  const wait=prepareTransitionWait(doc.querySelector('form'),()=>'',{site:'linkedin',timeoutMs:25,intervalMs:5});
  doc.querySelector('input').replaceWith(doc.querySelector('input').cloneNode());
  await assert.rejects(wait(),{code:'NO_TRANSITION'});
});

test('informational alerts do not block but validation alerts do',()=>{
 const doc=load('<form><div role="alert">Upload complete</div><button>Next</button></form>');
 assert.equal(assertCanAdvance(doc,doc.querySelector('button'),{site:'seek'}),true);
 doc.querySelector('[role=alert]').textContent='Required field missing';
 assert.throws(()=>assertCanAdvance(doc,doc.querySelector('button'),{site:'seek'}),{code:'VALIDATION_ERROR'});
});

test('recreated final-submit elements cannot reset a job attempt',()=>{
 const doc=load('<form><button>Submit</button></form>');
 claimSubmissionAttempt(doc.querySelector('form'),'seek');
 doc.querySelector('form').outerHTML='<form><button>Submit</button></form>';
 assert.throws(()=>claimSubmissionAttempt(doc.querySelector('form'),'seek'),{code:'NO_TRANSITION'});
});

test('submission attempt keys distinguish job changes while ignoring a UI hash change',()=>{
 const doc=load('<form><button>Submit</button></form>');
 dom.reconfigure({url:'https://www.seek.com.au/job/123/apply/review'});
 claimSubmissionAttempt(doc.querySelector('form'),'seek');
 dom.reconfigure({url:'https://www.seek.com.au/job/123/apply/review#changed'});
 assert.throws(()=>claimSubmissionAttempt(doc.querySelector('form'),'seek'),{code:'NO_TRANSITION'});
 dom.reconfigure({url:'https://www.seek.com.au/job/456/apply/review'});
 assert.doesNotThrow(()=>claimSubmissionAttempt(doc.querySelector('form'),'seek'));
});
