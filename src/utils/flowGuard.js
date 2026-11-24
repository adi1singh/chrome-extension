const diagnostics = [];
const sites = new Set(['seek', 'linkedin', 'indeed', 'microsoft']);
const steps = new Set(['advance', 'documents', 'review']);
const messages = {
  MISSING_CONTROL: 'The next control was not found. Review this step before continuing.',
  UNAVAILABLE_CONTROL: 'The next control is not ready. Review this step before continuing.',
  CLOSED_FORM: 'The application form changed or closed. Reopen it before continuing.',
  VALIDATION_ERROR: 'The application has validation errors. Review the highlighted fields.',
  INCOMPLETE_FIELDS: 'Required fields are incomplete. Review this step before continuing.',
  UPLOAD_PENDING: 'A page operation or upload is still running. Wait and review this step.',
  UPLOAD_TIMEOUT: 'The upload did not finish in time. Check the document before continuing.',
  MANUAL_REVIEW_REQUIRED: 'Review saved profile data and documents on the site before continuing.',
  UPLOAD_FAILED: 'The document could not be uploaded. Review it before continuing.',
  UNKNOWN_STEP: 'This application step was not recognised. Continue manually on the site.',
  NO_TRANSITION: 'The application did not advance. Review this step before trying again.',
  CANCELLED: 'The application flow was interrupted. Review the page before continuing.'
};

export class FlowStop extends Error {
  constructor(site, step, code, record = true) {
    super(messages[code] || messages.UNKNOWN_STEP);
    this.name = 'FlowStop';
    this.code = Object.hasOwn(messages, code) ? code : 'UNKNOWN_STEP';
    if (!record) return;
    const detail = Object.freeze({ site: sites.has(site) ? site : 'unknown',
      step: steps.has(step) ? step : 'unknown', code: this.code, timestamp: Date.now() });
    diagnostics.push(detail);
    if (diagnostics.length > 50) diagnostics.shift();
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jobgen-flow-diagnostic', { detail }));
    }
  }
}

export function readFlowDiagnostics() { return diagnostics.map(entry => ({ ...entry })); }
export function clearFlowDiagnostics() { diagnostics.length = 0; }

export function visibleForFlow(element) {
  if (!element?.isConnected || element.closest('#jobgen-react-app, #autofillProgressSection, .jobgen-root')) return false;
  const view = element.ownerDocument?.defaultView;
  for (let node = element; node?.nodeType === 1; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const style = view?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return false;
  }
  return true;
}

export function assertFormReady(root, { site, step = 'advance', signal, record = true, checkFields = true, expectedUrl } = {}) {
  const stop = code => { throw new FlowStop(site, step, code, record); };
  if (signal?.aborted) stop('CANCELLED');
  if (!root?.isConnected) stop('CLOSED_FORM');
  const owner = root.ownerDocument || root;
  if (expectedUrl !== undefined && owner.location?.href !== expectedUrl) stop('CANCELLED');
  const anyVisible = selector => [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)].some(visibleForFlow);
  if (anyVisible('[aria-invalid="true"], .artdeco-inline-feedback--error, [data-testid="upload-error"], [data-automation*="error"], [data-testid$="-error"]')) stop('VALIDATION_ERROR');
  const alertError = [...root.querySelectorAll('[role="alert"]')].some(element =>
    visibleForFlow(element) && /\b(?:error|failed|invalid)\b|required\s+field.*(?:missing|empty)|(?:is|are)\s+required|please\s+(?:enter|select|provide|upload|correct)/i.test(element.textContent || ''));
  if (alertError) stop('VALIDATION_ERROR');
  if (anyVisible('[aria-busy="true"], [role="progressbar"], [data-testid*="loading"], [class*="spinner"]')) stop('UPLOAD_PENDING');
  const invalid = [...root.querySelectorAll('input, select, textarea')].some(field =>
    visibleForFlow(field) && field.willValidate && field.validity && !field.validity.valid);
  if (checkFields && invalid) stop('INCOMPLETE_FIELDS');
  return true;
}

export function assertCanAdvance(root, button, options = {}) {
  assertFormReady(root, options);
  if (!button) throw new FlowStop(options.site, options.step, 'MISSING_CONTROL');
  if (!root.contains(button) || !visibleForFlow(button) || button.disabled ||
      button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') {
    throw new FlowStop(options.site, options.step, 'UNAVAILABLE_CONTROL');
  }
  return true;
}

export async function waitForUploadReady(root = document, { timeoutMs = 30000, intervalMs = 100, signal } = {}) {
  const start = Date.now();
  while (true) {
    try { assertFormReady(root, { site: 'seek', step: 'documents', signal, record: false, checkFields: false }); return true; }
    catch (error) {
      if (error.code !== 'UPLOAD_PENDING') throw new FlowStop('seek', 'documents', error.code);
      if (Date.now() - start >= timeoutMs) throw new FlowStop('seek', 'documents', 'UPLOAD_TIMEOUT');
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(1, timeoutMs - (Date.now() - start)))));
  }
}

// Capture control identities, not answers. A click alone is not a transition.
export function prepareTransitionWait(root, readStep, { site, timeoutMs = 10000, intervalMs = 100, signal } = {}) {
  const previousStep = readStep();
  const fieldShape = () => JSON.stringify([...root.querySelectorAll('input, select, textarea, fieldset')].map(field =>
    [field.tagName, field.getAttribute('type'), field.getAttribute('name'), field.hasAttribute('required'), field.getAttribute('autocomplete')]));
  const previousFields = fieldShape();
  return async () => {
    const start = Date.now();
    while (true) {
      if (signal?.aborted) throw new FlowStop(site, 'advance', 'CANCELLED');
      if (!root.isConnected || readStep() !== previousStep) return true;
      if (fieldShape() !== previousFields) return true;
      try { assertFormReady(root, { site, record: false }); }
      catch (error) {
        if (error.code !== 'UPLOAD_PENDING') throw new FlowStop(site, 'advance', error.code);
      }
      if (Date.now() - start >= timeoutMs) throw new FlowStop(site, 'advance', 'NO_TRANSITION');
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  };
}

// A React re-render must not reset a final-submit attempt on the same job/page.
// This is document-local. Cross-tab/reload idempotency still needs the backend.
const submissionAttempts = new WeakMap();
export function claimSubmissionAttempt(root, site) {
  if (!root?.isConnected) throw new FlowStop(site, 'review', 'CLOSED_FORM');
  const doc = root.ownerDocument || root;
  const url = new URL(doc.location.href);
  const id = site === 'linkedin' ? (url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || url.searchParams.get('currentJobId')) :
    site === 'seek' ? url.pathname.match(/\/job\/(\d+)/)?.[1] :
    url.searchParams.get('jk') || url.searchParams.get('vjk');
  const key = `${site}:${id || url.origin + url.pathname + url.search}`;
  const attempts = submissionAttempts.get(doc) || new Set();
  if (attempts.has(key)) throw new FlowStop(site, 'review', 'NO_TRANSITION');
  attempts.add(key);
  submissionAttempts.set(doc, attempts);
}
