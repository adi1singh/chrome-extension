import React from 'react';
import { createRoot } from 'react-dom/client';
import ActionButtons from '../components/ActionButtons.jsx';
import { invokeActionButton } from '../utils/actionButtonsBridge.js';
import { createProgressEmitters } from '../utils/progressBridge.js';
import {
  findEasyApplyButton,
  ensureEasyApplyModal,
  locateEasyApplyModal,
  isModalStillAttached,
  getFormPageTitle,
  isSubmissionSuccessHeading,
  releaseLinkedinLock
} from '../autofill/linkedin.js';
import { reportLinkedInApplicationOutcome } from '../autofill/linkedin.js';

// ======== LinkedIn cache helpers ========
const hasChromeStorage = () => typeof chrome !== 'undefined' && chrome?.storage?.local;

export const LINKEDIN_CACHE_KEY = 'jobgen_linkedin_profile_cache';

// Retrieve cached LinkedIn optimization payload from chrome storage
export const getStoredLinkedInCache = () => {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) {
      resolve(null);
      return;
    }

    chrome.storage.local.get([LINKEDIN_CACHE_KEY], (result) => {
      resolve(result[LINKEDIN_CACHE_KEY] || null);
    });
  });
};

// Persist LinkedIn analysis payload locally for reuse
export const saveLinkedInCache = (payload, { merge = false } = {}) => {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) {
      resolve();
      return;
    }

    const commit = (data) => {
      chrome.storage.local.set(
        {
          [LINKEDIN_CACHE_KEY]: data
        },
        () => resolve()
      );
    };

    if (!merge) {
      commit(payload);
      return;
    }

    chrome.storage.local.get([LINKEDIN_CACHE_KEY], (result) => {
      const existing = result[LINKEDIN_CACHE_KEY] || {};
      commit({
        ...existing,
        ...payload
      });
    });
  });
};

// Compare two LinkedIn profile URLs by their extracted handle
export const compareProfileUrl = (savedUrl, currentUrl) => {
  if (!savedUrl || !currentUrl) {
    return false;
  }
  if (savedUrl === currentUrl) {
    return true;
  }
  const extractHandle = (url) => {
    if (typeof url !== 'string') {
      return null;
    }
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!match || !match[1]) {
      return null;
    }
    return decodeURIComponent(match[1]).replace(/\/+$/, '').toLowerCase();
  };

  const savedHandle = extractHandle(savedUrl);
  const currentHandle = extractHandle(currentUrl);
  if (!savedHandle || !currentHandle) {
    return false;
  }
  return savedHandle === currentHandle;
};


// ======== LinkedIn page detection helpers ========
const normalizeUrl = (url) => (typeof url === 'string' ? url.toLowerCase() : '');

const isLinkedInContext = (currentSite, normalizedUrl) => {
  if (currentSite) {
    return currentSite.toLowerCase() === 'linkedin';
  }
  return normalizedUrl.includes('linkedin.');
};

export const isLinkedInProfilePage = (url) => {
  const normalizedUrl = normalizeUrl(url);
  return normalizedUrl.includes('linkedin.com/in/');
};

export const isLinkedInSearchPage = (currentSite, currentUrl) => {
  const normalizedUrl = normalizeUrl(currentUrl);
  if (!isLinkedInContext(currentSite, normalizedUrl)) return false;

  return (
    normalizedUrl.includes('/jobs/search') ||
    normalizedUrl.includes('/jobs/search-results') ||
    normalizedUrl.includes('/jobs/collections') ||
    normalizedUrl.endsWith('/jobs') ||
    normalizedUrl.endsWith('/jobs/')
  );
};

export const isLinkedInJobViewPage = (currentSite, currentUrl) => {
  const normalizedUrl = normalizeUrl(currentUrl);
  if (!isLinkedInContext(currentSite, normalizedUrl)) return false;

  return normalizedUrl.includes('/jobs/view/');
};

export const isLinkedInJobPage = (currentSite, currentUrl) => (
  isLinkedInSearchPage(currentSite, currentUrl) ||
  isLinkedInJobViewPage(currentSite, currentUrl)
);

const SEARCH_CARD_ANCHOR_SELECTORS = [
  '.job-card-job-posting-card-wrapper[aria-current="page"] .job-card-job-posting-card-wrapper__card-link[href*="currentJobId="]',
  '.semantic-search-results-list__list-item[aria-current="page"] .job-card-job-posting-card-wrapper__card-link[href*="currentJobId="]',
  '.jobs-search-results__list-item[aria-current="page"] .job-card-job-posting-card-wrapper__card-link[href*="currentJobId="]',
  '.job-card-job-posting-card-wrapper__card-link[href*="currentJobId="]'
];

const resolveSearchResultAnchor = () => {
  for (const selector of SEARCH_CARD_ANCHOR_SELECTORS) {
    const candidate = document.querySelector(selector);
    if (candidate) return candidate;
  }
  return null;
};

export const ensureSearchResultsUrlHasJobId = ({ currentUrl, guardRef, allowTrigger = true } = {}) => {
  if (typeof window === 'undefined') return;
  if (typeof currentUrl !== 'string') return;

  const lowerUrl = currentUrl.toLowerCase();
  if (!lowerUrl.includes('/jobs/search-results') || !lowerUrl.includes('/jobs/search')) {
    if (guardRef) guardRef.current = null;
    return;
  }

  if (lowerUrl.includes('currentjobid=')) {
    if (guardRef) guardRef.current = null;
    return;
  }

  if (!allowTrigger) return;

  if (guardRef && guardRef.current === currentUrl) {
    return;
  }

  const anchor = resolveSearchResultAnchor();
  if (!anchor) return;

  if (guardRef) guardRef.current = currentUrl;

  setTimeout(() => {
    try {
      const target = resolveSearchResultAnchor() || anchor;
      if (!target) {
        if (guardRef) guardRef.current = null;
        return;
      }
      target.click();
    } catch (error) {
      console.warn('Failed to auto-select LinkedIn job card anchor:', error);
      if (guardRef) guardRef.current = null;
    }
  }, 0);
};

// ======== JobGen Action Buttons ========
const JOBGEN_ACTION_ROOT_ATTR = 'data-jobgen-action-root';
const JOBGEN_HOST_OFFSET = 2; // 0 = closest container, 1 = next parent up, etc.

// Determine which container should host the JobGen action buttons.
function findJobGenButtonHost(easyApplyButton) {
  if (!easyApplyButton) return null;

  const preferredSelectors = [
    '.jobs-unified-top-card__buttons',
    '.jobs-details-top-card__primary-actions',
    '.jobs-unified-top-card__primary-content',
    '.jobs-apply-button--top-card',
    '.jobs-details-actions',
    '.jobs-detail-page__cta-container'
  ];

  let host = null;

  for (const selector of preferredSelectors) {
    const node = easyApplyButton.closest(selector);
    if (node) {
      host = node;
      break;
    }
  }

  if (!host) {
    let candidate = easyApplyButton.parentElement;
    while (candidate && candidate !== document.body) {
      try {
        const style = window.getComputedStyle(candidate);
        const display = style.display;
        const rowLike = display === 'flex' || display === 'inline-flex' || display === 'grid';
        if (rowLike && candidate.querySelectorAll('a, button').length >= 2) {
          host = candidate;
          break;
        }
      } catch (_error) {
        // Ignore computed style errors (e.g., detached nodes)
      }
      candidate = candidate.parentElement;
    }
  }

  if (!host) {
    host = easyApplyButton.parentElement;
  }

  const isRowLike = (element) => {
    if (!element || typeof window === 'undefined') return false;
    try {
      const style = window.getComputedStyle(element);
      if (!style) return false;
      const display = style.display;
      if (display === 'flex' || display === 'inline-flex') {
        return true;
      }
      if (display === 'grid') {
        const flow = style.gridAutoFlow || '';
        if (flow.includes('column')) return true;
        const templateColumns = style.gridTemplateColumns || '';
        return templateColumns.split(' ').length >= 2;
      }
      return false;
    } catch (_error) {
      return false;
    }
  };

  let adjustedHost = host;
  let steps = JOBGEN_HOST_OFFSET;
  while (adjustedHost && steps > 0 && adjustedHost.parentElement && adjustedHost.parentElement !== document.body) {
    adjustedHost = adjustedHost.parentElement;
    steps -= 1;
  }

  if (adjustedHost && host && adjustedHost !== host) {
    const adjustedIsRow = isRowLike(adjustedHost);
    const hostIsRow = isRowLike(host);

    if (!adjustedIsRow && hostIsRow) {
      return host;
    }

    if (adjustedIsRow && !hostIsRow) {
      return adjustedHost;
    }
  }

  if (adjustedHost && isRowLike(adjustedHost)) {
    return adjustedHost;
  }

  if (host && isRowLike(host)) {
    return host;
  }

  return adjustedHost || host;
}

let pendingInjection = false; // pending switch

// Debounce button injection to coalesce rapid DOM changes. Avoid duplicates.
function scheduleLinkedInButtonInjection() {
  if (pendingInjection) return;
  pendingInjection = true;

  requestAnimationFrame(() => { //the callback clears the pendingInjection flag (so future updates can schedule again) and then calls tryInjectLinkedInButtons() to render the buttons.
    pendingInjection = false;
    tryInjectLinkedInButtons();
  });
}

// Attempt to render JobGen buttons if Easy Apply is present.
function tryInjectLinkedInButtons() {
  const easyApplyButton = findEasyApplyButton();
  // console.log('Easy Apply detected, mount JOBGEN action buttons', easyApplyButton);
  if (!easyApplyButton) {
    removeJobGenButtons();
    return;
  }

  const host = findJobGenButtonHost(easyApplyButton);
  if (!host || host.contains(document.querySelector('#jobgen-react-app'))) {
    return;
  }

  renderJobGenButtons(host);
}

// Initialize observers and kick off initial button injection.
export function setupLinkedInJobGenButtons() {
  if (window.__jobgenLinkedInButtonsInitialized) {
    scheduleLinkedInButtonInjection();
    return;
  }

  window.__jobgenLinkedInButtonsInitialized = true;

  scheduleLinkedInButtonInjection();

  const observer = new MutationObserver(() => {
    scheduleLinkedInButtonInjection();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener('focus', scheduleLinkedInButtonInjection, { passive: true });
  window.addEventListener('resize', scheduleLinkedInButtonInjection, { passive: true });
}

// Render (or re-render) the JobGen action button group within the host.
function renderJobGenButtons(host) {
  if (!host) return;

  // console.log('[JobGen] renderJobGenButtons called with host:', host);

  // Remove any JobGen containers that are no longer anchored to this host.
  document.querySelectorAll(`[${JOBGEN_ACTION_ROOT_ATTR}]`).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.parentElement !== host) {
      try {
        node.__jobgenRoot?.unmount?.();
      } catch (error) {
        console.warn('⚠️ Error unmounting stale JobGen action group:', error);
      }
      node.remove();
    }
  });

  const hostContainers = Array.from(host.children).filter((child) => (
    child instanceof HTMLElement && child.getAttribute(JOBGEN_ACTION_ROOT_ATTR) === 'true'
  ));

  // Drop duplicated containers that may linger after rapid DOM swaps.
  hostContainers.slice(1).forEach((staleContainer) => {
    if (!(staleContainer instanceof HTMLElement)) return;
    try {
      staleContainer.__jobgenRoot?.unmount?.();
    } catch (error) {
      console.warn('⚠️ Error unmounting duplicate JobGen action group:', error);
    }
    staleContainer.remove();
  });

  let container = hostContainers[0];

  if (!(container instanceof HTMLElement)) {
    container = document.createElement('div');
    container.setAttribute(JOBGEN_ACTION_ROOT_ATTR, 'true');
    // console.log('[JobGen] injecting ActionButtons container within Easy Apply host');
    host.insertAdjacentElement('beforeend', container);
  }

  // handling dropdown menu being clipped
  let node = container.parentElement;
  while (node && node instanceof HTMLElement && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowValues = [style.overflow, style.overflowX, style.overflowY];
    const hasScrollOverflow = overflowValues.some((val) => val === 'auto' || val === 'scroll');
    const hasHiddenOverflow = overflowValues.some((val) => val === 'hidden');
    if (style.position === 'static') {
      node.style.position = 'relative';
    }
    if (!node.style.zIndex) {
      node.style.zIndex = '10';
    }

    if (hasHiddenOverflow && !hasScrollOverflow) {
      node.style.overflow = 'visible';
      node.style.overflowX = 'visible';
      node.style.overflowY = 'visible';
      console.log('[JobGen] relaxed overflow on ancestor to avoid clipping:', node);
      break;
    }
    if (node.matches('[data-view-name="job-detail-page"]')) break;
    if (node.matches('[class*="jobs-semantic-search-job-details-wrapper"]')) break;
    node = node.parentElement;
  }

  Object.assign(container.style, {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    margin: '0',
    marginTop: '0',
    flex: '0 0 auto',
    minWidth: '0',
    position: 'relative',
    zIndex: '9990'
  });

  const DEFAULT_INLINE_GAP = 8;
  const parsePx = (value) => {
    if (typeof value !== 'string') return 0;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const updateContainerSpacing = () => {
    if (!container?.isConnected) return;

    let inlineGap = DEFAULT_INLINE_GAP;
    try {
      const hostStyles = window.getComputedStyle(host);
      const gapX = parsePx(hostStyles.columnGap) || parsePx(hostStyles.gap);
      const gapY = parsePx(hostStyles.rowGap) || parsePx(hostStyles.gap);

      if (gapX > 0) {
        inlineGap = 0;
      }

      container.style.marginLeft = inlineGap ? `${inlineGap}px` : '0';
      container.style.marginTop = '0';

      const hostRect = host.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const onNewLine = containerRect.top - hostRect.top > 2;

      if (onNewLine) {
        container.style.marginLeft = '0';
        const verticalGap = gapY > 0 ? gapY : DEFAULT_INLINE_GAP;
        container.style.marginTop = `${verticalGap}px`;
      }
    } catch (error) {
      console.warn('⚠️ Unable to compute JobGen button spacing for LinkedIn CTA row:', error);
    }
  };

  updateContainerSpacing();
  requestAnimationFrame(updateContainerSpacing);


  if (!container.__jobgenRoot) {
    // console.log('[JobGen] creating React root for ActionButtons');
    container.__jobgenRoot = createRoot(container);
  }

  // console.log('[JobGen] rendering ActionButtons into container:', container);
  container.__jobgenRoot.render(
    React.createElement(ActionButtons, {
      onAction: (action) => {
        // console.log('[JobGen] ActionButtons onAction invoked:', action);
        const handled = invokeActionButton(action);
        if (!handled) {
          console.warn(`⚠️ JobGen action "${action}" triggered but no handler is registered.`);
        }
      },
      onApply: () => {
        // console.log('[JobGen] ActionButtons onApply invoked');
        const handled = invokeActionButton('apply');
        if (!handled) {
          console.warn('⚠️ JobGen apply action triggered but no handler is registered.');
        }
      }
    })
  );
}

// Unmount every injected JobGen action button group from the page.
function removeJobGenButtons() {
  document.querySelectorAll(`[${JOBGEN_ACTION_ROOT_ATTR}]`).forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    try {
      container.__jobgenRoot?.unmount?.();
    } catch (error) {
      console.warn('⚠️ Unable to unmount JobGen LinkedIn buttons cleanly:', error);
    }
    container.remove();
  });
}
// ======== End of JobGen Action Buttons ========


// ======== Easy Apply Modal Monitor ========
// Observes the Easy Apply modal lifecycle and publishes events plus an abort signal.
const SUBMIT_APPLICATION_SELECTOR = 'button[aria-label="Submit application"]';

let linkedinSubmitStage = false;
let submitAttempted = false;

const releaseLinkedinLockBoth = (...lockNames) => {
  lockNames
    .filter(Boolean)
    .forEach((lockName) => {
      try {
        console.log('=== Running lock-release safety guard via monitor');
        releaseLinkedinLock(lockName);
      } catch (error) {
        console.warn('⚠️ Unable to release LinkedIn lock from monitor', { lockName, error });
      }
    });
};
let trackedSubmitButton = null;

const SUBMIT_LISTENER_OPTIONS = { capture: true };

// Mark that the user clicked the Easy Apply submit CTA.
function submitClickListener() {
  submitAttempted = true;
}

// Ensure we are watching the current submit button for click attempts.
function attachSubmitClickListener(button) {
  if (!button || trackedSubmitButton === button) return;
  detachSubmitClickListener();
  trackedSubmitButton = button;
  try {
    trackedSubmitButton.addEventListener('click', submitClickListener, SUBMIT_LISTENER_OPTIONS);
  } catch (error) {
    console.warn('⚠️ Unable to attach LinkedIn submit listener:', error);
  }
}

// Stop tracking submit clicks for the previous button.
function detachSubmitClickListener() {
  if (!trackedSubmitButton) return;
  try {
    trackedSubmitButton.removeEventListener('click', submitClickListener, SUBMIT_LISTENER_OPTIONS);
  } catch (error) {
    console.warn('⚠️ Unable to detach LinkedIn submit listener:', error);
  }
  trackedSubmitButton = null;
}

// Clear the submit attempt flag for a fresh modal state.
function resetSubmitAttempted() {
  submitAttempted = false;
}

function setLinkedInSubmitStage(value) {
  linkedinSubmitStage = Boolean(value);
}

export function isLinkedInSubmitStage() {
  return linkedinSubmitStage;
}
const EASY_APPLY_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // safety valve

// Builds a reusable Easy Apply watcher that shares modal state across consumers.
export function createEasyApplyModalMonitor(initialOptions = {}) {
  const {
    context: initialContext = 'autofill',
    onModalReady: initialOnModalReady,
    onModalDismissed: initialOnModalDismissed,
    onReviewStep: initialOnReviewStep
  } = initialOptions || {};

  let running = false;
  let modal = null;
  let rafId = null;
  let observer = null;
  let aborted = false;
  let abortReject = null;
  let abortPromise = null;
  let emittedReview = false;
  let inactivityTimer = null;
  let currentContext = initialContext;

  const modalReadyListeners = new Set();
  const modalDismissedListeners = new Set();
  const reviewStepListeners = new Set();

  const observerOptions = { childList: true, subtree: true };
  let observedShadowRoots = new WeakSet();

  // Refresh the abort promise that signals modal dismissal.
  const resetAbortPromise = () => {
    abortPromise = new Promise((_, reject) => {
      abortReject = reject;
    });
    aborted = false;
  };

  // Stop the inactivity safeguard timer if it is running.
  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  };

  // Restart the inactivity safeguard whenever we observe activity.
  const resetInactivityTimer = () => {
    if (EASY_APPLY_INACTIVITY_TIMEOUT_MS <= 0) return;
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      console.warn('⚠️ Easy Apply monitor timed out due to inactivity. Aborting watcher.');
      abort(new Error('LinkedIn Easy Apply monitor timed out due to inactivity'));
    }, EASY_APPLY_INACTIVITY_TIMEOUT_MS);
  };

  // Cancel any pending RAF-driven polling loop iterations.
  const stopRaf = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  // Disconnect DOM observers and clear the tracked shadow roots.
  const disconnectObserver = () => {
    observer?.disconnect();
    observer = null;
    observedShadowRoots = new WeakSet();
  };

  // Register a listener in the provided set and return its remover.
  const addListener = (set, listener) => {
    if (typeof listener !== 'function') return () => {};
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };

  // Attach callback hooks for modal lifecycle events.
  const registerCallbacks = ({ onModalReady, onModalDismissed, onReviewStep } = {}) => {
    const removers = [];

    if (typeof onModalReady === 'function') {
      removers.push(addListener(modalReadyListeners, onModalReady));
      if (modal && running) {
        try {
          onModalReady(modal);
        } catch (error) {
          console.error('❌ Error in Easy Apply monitor immediate onModalReady handler:', error);
        }
      }
    }

    if (typeof onModalDismissed === 'function') {
      removers.push(addListener(modalDismissedListeners, onModalDismissed));
    }

    if (typeof onReviewStep === 'function') {
      removers.push(addListener(reviewStepListeners, onReviewStep));
      if (emittedReview && modal) {
        try {
          const formContainer = modal.querySelector('.jobs-easy-apply-modal__content');
          onReviewStep((formContainer && getFormPageTitle(formContainer)) || '', modal);
        } catch (error) {
          console.error('❌ Error in Easy Apply monitor immediate onReviewStep handler:', error);
        }
      }
    }

    return () => {
      removers.forEach((remove) => {
        try {
          remove();
        } catch (error) {
          console.error('❌ Error removing Easy Apply monitor listener:', error);
        }
      });
    };
  };

  // Update logging context and reset submit-stage tracking.
  const setContext = (value) => {
    currentContext = value || 'autofill';
    setLinkedInSubmitStage(false);
    resetSubmitAttempted();
    detachSubmitClickListener();
  };

  // Abort monitoring, reject waiters, and clear internal state.
  const abort = (reason) => {
    if (aborted) return;
    aborted = true;
    clearInactivityTimer();
    stopRaf();
    disconnectObserver();
    running = false;
    modal = null;
    emittedReview = false;
    setLinkedInSubmitStage(false);
    resetSubmitAttempted();
    detachSubmitClickListener();
    const error = reason instanceof Error ? reason : new Error(reason || 'LinkedIn Easy Apply monitor aborted');
    try {
      abortReject?.(error);
    } catch (emitError) {
      console.warn('⚠️ Easy Apply monitor abort rejection failed:', emitError);
    }
  };

  // Notify listeners that the modal is present and ready.
  const emitModalReady = (node) => {
    resetInactivityTimer();
    detachSubmitClickListener();
    resetSubmitAttempted();
    for (const listener of Array.from(modalReadyListeners)) {
      try {
        listener(node);
      } catch (error) {
        console.error('❌ Error in Easy Apply monitor onModalReady handler:', error);
      }
    }
  };

  // Notify listeners that the modal was dismissed.
  const emitModalDismissed = () => {
    clearInactivityTimer();
    releaseLinkedinLockBoth(currentContext, 'autofill', 'auto-apply');
    for (const listener of Array.from(modalDismissedListeners)) {
      try {
        listener();
      } catch (error) {
        console.error('❌ Error in Easy Apply monitor onModalDismissed handler:', error);
      }
    }
    setLinkedInSubmitStage(false);
    detachSubmitClickListener(); // tear down submit tracking when modal goes away

    const attempted = submitAttempted;
    resetSubmitAttempted();

    const immediateModal = scanForSubmissionSuccess();
    if (immediateModal) {
      notifySubmissionSuccess(immediateModal); // success landed after dismissal; reuse submission handler
      return;
    }

    if (attempted) {
      // A click or dismissed modal is not proof of submission.
      const confirmationVersion = submissionConfirmationVersion;
      setTimeout(() => {
        if (submissionConfirmationVersion !== confirmationVersion) return;
        const successModal = scanForSubmissionSuccess();
        if (successModal) {
          notifySubmissionSuccess(successModal);
        } else if (!locateEasyApplyModal()) {
          const { error: errorProgress } = createProgressEmitters('linkedin');
          errorProgress('Submission could not be confirmed. Check LinkedIn before trying again.');
        }
      }, 2500);
      return;
    }

    try {
      const { error: errorProgress } = createProgressEmitters('linkedin');
      errorProgress('Application closed by user');
    } catch (progressError) {
      console.warn('⚠️ Unable to emit LinkedIn dismissal progress update:', progressError);
    }
  };

  // Notify listeners that the review/submit step is active.
  const emitReviewStep = (title) => {
    resetInactivityTimer();
    for (const listener of Array.from(reviewStepListeners)) {
      try {
        listener(title, modal);
      } catch (error) {
        console.error('❌ Error in Easy Apply monitor onReviewStep handler:', error);
      }
    }
  };

  // Detect whether the submit CTA is visible inside the modal.
  const inspectFormState = () => {
    if (!modal) return;
    const formContainer = modal.querySelector('.jobs-easy-apply-modal__content');
    if (!formContainer) return;

    const submitButton = modal.querySelector(SUBMIT_APPLICATION_SELECTOR);
    if (submitButton) {
      if (!emittedReview) {
        emittedReview = true;
        const title = getFormPageTitle(formContainer) || 'Review your application';
        emitReviewStep(title);
        console.log('=== Review stage detected via submit button');
      }
      setLinkedInSubmitStage(true);
      attachSubmitClickListener(submitButton); // watch for manual submit clicks
    } else {
      emittedReview = false;
      setLinkedInSubmitStage(false);
      detachSubmitClickListener(); // button gone, stop tracking
    }
  };

  // Make sure the interop shadow root is also being observed.
  const ensureShadowObservation = () => {
    const outlet = document.querySelector('#interop-outlet');
    if (outlet?.shadowRoot && observer && !observedShadowRoots.has(outlet.shadowRoot)) {
      observer.observe(outlet.shadowRoot, observerOptions);
      observedShadowRoots.add(outlet.shadowRoot);
    }
  };

  // Core polling loop: refresh modal reference and state flags.
  const evaluateModalState = () => {
    if (!running) return;

    resetInactivityTimer();

    if (!modal || !isModalStillAttached(modal)) {
      const latestModal = locateEasyApplyModal();
      if (latestModal && latestModal !== modal) {
        modal = latestModal;
        emittedReview = false;
        setLinkedInSubmitStage(false);
        resetSubmitAttempted();
        detachSubmitClickListener(); // modal replaced, reset submit listener
        emitModalReady(latestModal);
      } else if (!latestModal) {
        if (modal) {
          emitModalDismissed();
        }
        abort('LinkedIn Easy Apply modal dismissed');
        return;
      } else {
        emitModalDismissed();
        abort('LinkedIn Easy Apply modal dismissed');
        return;
      }
    }

    if (!modal) {
      return;
    }

    if (modal.getAttribute('aria-hidden') === 'true') {
      emitModalDismissed();
      abort('LinkedIn Easy Apply modal dismissed');
      return;
    }

    inspectFormState();
  };

  // Schedule another evaluation on the next animation frame.
  const scheduleEvaluation = () => {
    if (!running) return;
    ensureShadowObservation();
    evaluateModalState();
    rafId = requestAnimationFrame(scheduleEvaluation);
  };

  // Begin monitoring and resolve with the active modal element.
  const start = async () => {
    if (running) {
      resetInactivityTimer();
      return modal;
    }

    resetAbortPromise();
    running = true;
    emittedReview = false;
    setLinkedInSubmitStage(false);
    resetSubmitAttempted();
    detachSubmitClickListener(); // modal detached, clean up listener

    try {
      modal = await ensureEasyApplyModal({ context: currentContext });
      emitModalReady(modal);
    } catch (error) {
      abort(error);
      throw error;
    }

    observer = new MutationObserver(() => {
      evaluateModalState();
    });

    if (document.body) {
      observer.observe(document.body, observerOptions);
    }

    ensureShadowObservation();
    resetInactivityTimer();
    scheduleEvaluation();

    return modal;
  };

  // Stop monitoring and release internal references.
  const stop = () => {
    if (!running) {
      clearInactivityTimer();
    } else {
      running = false;
      clearInactivityTimer();
      stopRaf();
      disconnectObserver();
    }
    modal = null;
    emittedReview = false;
    setLinkedInSubmitStage(false);
    resetSubmitAttempted();
    detachSubmitClickListener(); // stop monitoring when stopped explicitly
  };

  // Expose the abort promise so callers can await dismissal.
  const waitForAbort = () => abortPromise;

  resetAbortPromise();
  registerCallbacks({
    onModalReady: initialOnModalReady,
    onModalDismissed: initialOnModalDismissed,
    onReviewStep: initialOnReviewStep
  });

  return {
    start,
    stop,
    waitForAbort,
    getModal: () => modal,
    isRunning: () => running,
    abort,
    registerCallbacks,
    setContext
  };
}

let sharedEasyApplyMonitor = null;

export async function ensureEasyApplyMonitor(options = {}) {
  const {
    context = 'autofill',
    onModalReady,
    onModalDismissed,
    onReviewStep
  } = options || {};

  if (!sharedEasyApplyMonitor) {
    sharedEasyApplyMonitor = createEasyApplyModalMonitor();
  }

  sharedEasyApplyMonitor.setContext(context);
  const unregister = sharedEasyApplyMonitor.registerCallbacks({ onModalReady, onModalDismissed, onReviewStep });

  try {
    const modal = await sharedEasyApplyMonitor.start();
    return { monitor: sharedEasyApplyMonitor, modal, unregister };
  } catch (error) {
    unregister();
    if (!sharedEasyApplyMonitor.isRunning()) {
      sharedEasyApplyMonitor = null;
    }
    throw error;
  }
}

export function stopEasyApplyMonitor() {
  if (sharedEasyApplyMonitor) {
    sharedEasyApplyMonitor.stop();
    sharedEasyApplyMonitor = null;
  }
}

// ======== Submission Success Monitor ========
const submissionListeners = new Set();
let submissionMonitor = null;

// Look for a LinkedIn post-apply modal across main DOM and shadow roots.
function scanForSubmissionSuccess() {
  const contexts = [document];
  const outlet = document.querySelector('#interop-outlet');
  if (outlet?.shadowRoot) {
    contexts.push(outlet.shadowRoot);
  }

  const modalSelectors = [
    '[role="dialog"][aria-labelledby="post-apply-modal"]',
    '[data-test-modal][role="dialog"]'
  ];

  for (const contextRoot of contexts) {
    if (!contextRoot) continue;
    for (const selector of modalSelectors) {
      const modals = contextRoot.querySelectorAll(selector);
      for (const modal of modals) {
        const titleElement = modal.querySelector('.jpac-modal-header')
          || modal.querySelector('#post-apply-modal')
          || modal.querySelector('h2, h3');
        const titleText = titleElement?.textContent;
        if (isSubmissionSuccessHeading(titleText)) {
          return modal;
        }
      }
    }
  }

  return null;
}

// Broadcast the success modal to subscribers and emit progress updates.
let submissionConfirmationVersion = 0;
const notifiedSubmissionModals = new WeakSet();
function notifySubmissionSuccess(modal) {
  if (notifiedSubmissionModals.has(modal)) return;
  notifiedSubmissionModals.add(modal);
  submissionConfirmationVersion++;
  // Fan out the detected success modal to every registered consumer.
  // Consumers include auto-apply/autofill flows that may update UI or log outcomes.
  submissionListeners.forEach((listener) => {
    try {
      listener(modal);
    } catch (error) {
      console.error('❌ Error in LinkedIn submission success listener:', error);
    }
  });
  resetSubmitAttempted();
  detachSubmitClickListener();
  try {
    const { update: updateProgress } = createProgressEmitters('linkedin');
    updateProgress('Application', 'submitted', { message: 'Application submitted!' });
  } catch (error) {
    console.warn('⚠️ Unable to emit LinkedIn submission progress update:', error);
  }
  try {
    reportLinkedInApplicationOutcome('Applied');
  } catch (error) {
    console.warn('⚠️ Unable to report LinkedIn application outcome:', error);
  }

  releaseLinkedinLockBoth('auto-apply', 'autofill');
}


// Build a DOM watcher that emits when the submission success modal appears.
function createSubmissionSuccessMonitorInternal() {
  let running = false;
  let observer = null;
  let rafId = null;
  let lastModal = null;
  let observedShadowRoot = null;

  const observerOptions = { childList: true, subtree: true };

  // Poll for success modals and dedupe notifications per element instance.
  const checkSuccess = () => {
    if (!running) return;

    const outlet = document.querySelector('#interop-outlet');
    if (outlet?.shadowRoot && outlet.shadowRoot !== observedShadowRoot) {
      observer?.observe(outlet.shadowRoot, observerOptions);
      observedShadowRoot = outlet.shadowRoot;
    } else if ((!outlet || !outlet.shadowRoot) && observedShadowRoot) {
      observedShadowRoot = null;
    }

    const modal = scanForSubmissionSuccess();
    if (!modal) {
      if (lastModal && !isModalStillAttached(lastModal)) {
        lastModal = null;
      }
      return;
    }

    if (modal !== lastModal) {
      lastModal = modal;
      console.log('✅ LinkedIn submission success detected via monitor');
      notifySubmissionSuccess(modal);
    }
  };

  // Kick the polling loop forward on the next animation frame.
  const scheduleRaf = () => {
    if (!running) return;
    checkSuccess();
    rafId = requestAnimationFrame(scheduleRaf);
  };

  // Start monitoring the DOM for a submission success modal.
  const start = () => {
    if (running) return;
    running = true;
    checkSuccess();

    observer = new MutationObserver(() => {
      checkSuccess();
    });

    if (document.body) {
      observer.observe(document.body, observerOptions);
    }

    scheduleRaf();
  };

  // Stop monitoring and reset cached modal references.
  const stop = () => {
    if (!running) return;
    running = false;
    observer?.disconnect();
    observer = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastModal = null;
    observedShadowRoot = null;
  };

  return {
    start,
    stop,
    isRunning: () => running
  };
}

export function ensureLinkedInSubmissionMonitor() {
  if (!submissionMonitor) {
    submissionMonitor = createSubmissionSuccessMonitorInternal();
  }
  submissionMonitor.start();
  return submissionMonitor;
}

export function stopLinkedInSubmissionMonitor() {
  submissionMonitor?.stop();
}

export function subscribeToSubmissionSuccess(listener) {
  if (typeof listener !== 'function') return () => {};
  submissionListeners.add(listener);
  return () => {
    submissionListeners.delete(listener);
  };
}

export function awaitSubmissionSuccess(timeoutMs = 5000) {
  ensureLinkedInSubmissionMonitor();
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let unsubscribe = () => {};

    const cleanup = () => {
      unsubscribe();
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for LinkedIn submission success'));
      }, timeoutMs);
    }

    unsubscribe = subscribeToSubmissionSuccess((modal) => {
      cleanup();
      resolve(modal);
    });
  });
}
