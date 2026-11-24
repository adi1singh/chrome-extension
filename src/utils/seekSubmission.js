import { assertCanAdvance, claimSubmissionAttempt } from './flowGuard.js';
export function hasSeekSubmissionConfirmation(root = document) {
  return Boolean(root.querySelector('#applicationSent') ||
    /good luck/i.test(root.querySelector('h1')?.textContent || ''));
}

const pendingSubmissions = new WeakMap();

// A submit click is only an attempt. Wait for the site's confirmation before
// publishing success. On full navigation, the success-page handler takes over.
export function submitSeekApplication(button, { root = document, timeoutMs = 15000 } = {}) {
  if (pendingSubmissions.has(button)) return pendingSubmissions.get(button);
  let attempted = false;
  const submission = new Promise((resolve, reject) => {
    if (!button || button.disabled || !button.isConnected) {
      reject(new Error('Submit button is unavailable'));
      return;
    }
    if (hasSeekSubmissionConfirmation(root)) {
      resolve();
      return;
    }
    let timer;
    const observer = new MutationObserver(() => {
      if (hasSeekSubmissionConfirmation(root)) finish();
    });
    const finish = (error) => {
      observer.disconnect();
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => finish(new Error(
      'Submission could not be confirmed. Check SEEK before trying again.'
    )), timeoutMs);
    try {
      assertCanAdvance(button.form || root, button, { site: 'seek', step: 'review' });
      button.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      button.focus();
      assertCanAdvance(button.form || root, button, { site: 'seek', step: 'review' });
      claimSubmissionAttempt(root, 'seek');
      attempted = true;
      button.click();
      if (hasSeekSubmissionConfirmation(root)) finish();
    } catch (error) {
      finish(error);
    }
  });
  if (button) {
    pendingSubmissions.set(button, submission);
    // After any click, keep the attempt latched even if confirmation times out.
    // Validation failures before clicking can be corrected and retried.
    submission.catch(() => { if (!attempted) pendingSubmissions.delete(button); });
  }
  return submission;
}
