# LinkedIn Modal Monitoring Plan

## Background
LinkedIn auto-apply currently opens the Easy Apply modal via `ensureEasyApplyModal` inside `src/autofill/linkedin.js` and then polls the DOM inline to catch modal dismissal or submission success. We want dedicated monitors, hosted in `src/utils/linkedinHelpers.js`, so the modal state can be observed from multiple flows (auto-apply, autofill, or future features) without duplicating the DOM logic.

## Feasibility Assessment
- `ensureEasyApplyModal`, `locateEasyApplyModal`, `waitForApplicationSubmissionSuccess`, and `isModalStillAttached` already solve the heavy DOM work; exposing them (or wrapping them) lets helpers build on proven behavior.
- `getFormPageTitle` identifies the current modal step and returns "Review your application" when the final confirmation page is active, so the monitor can reuse it instead of replicating selectors.
- `waitForApplicationSubmissionSuccess` currently polls for post-submit dialogs. Refactoring it into a reusable watcher will let us detect success even outside the auto-apply loop.
- `linkedinHelpers.js` already imports from `linkedin.js` (`findEasyApplyButton`), so adding a few more exports will not introduce new circular dependencies.
- Conclusion: adding monitor utilities in `linkedinHelpers.js` is low risk and keeps us from rewriting DOM selectors.

## Implementation Plan
1. **Export the needed primitives** from `src/autofill/linkedin.js` (e.g., `ensureEasyApplyModal`, `locateEasyApplyModal`, `isModalStillAttached`, `getFormPageTitle`, `waitForApplicationSubmissionSuccess`, and possibly `isSubmissionSuccessHeading`). Limit the surface to what the helper truly needs.
2. **Create an Easy Apply modal monitor** in `src/utils/linkedinHelpers.js` *(completed)*:
   - Factory `createEasyApplyModalMonitor()` manages the underlying watcher; `ensureEasyApplyMonitor({ context, onModalReady, onModalDismissed, onReviewStep })` now returns the shared instance while handling listener registration.
   - The monitor calls `ensureEasyApplyModal` once, keeps a live modal reference, and relies on a `MutationObserver`+`requestAnimationFrame` loop to:
     - detect detachment (`isModalStillAttached` → fire `onModalDismissed`, abort waiters, and, if no submit attempt occurred, emit `errorProgress('Application closed by user')`),
     - detect the review step by checking for the submit CTA. When present it flips a shared submit-stage flag **and** attaches a capture-phase click listener so we know whether the user attempted submission.
   - A shared flag `submitAttempted` now ensures the discard message only fires when the modal closes without a submit click. The flag resets whenever a new modal/context starts or success is detected. Consumers can still `waitForAbort()` to race against user dismissal, and the inactivity timeout remains in place.
3. **Refactor `autoApplyLinkedin`** to spin up the monitor alongside its existing loop via `ensureEasyApplyMonitor`:
   - Register callbacks for dismissal, review detection, and cancellation while reusing the shared watcher.
   - Race every async step against the monitor's abort promise so the flow unwinds immediately when the user closes the modal.
4. **Refactor `autofillLinkedin`** to subscribe to the same monitor so user-initiated dismissal is captured while the autofill helper runs and the watcher remains active afterward.
5. **Introduce a submission success monitor** in helpers *(completed)*:
   - `createSubmissionSuccessMonitorInternal()` watches both `document` and the `#interop-outlet` shadow root, dedupes identical modals via `lastModal`, and notifies subscribers (auto-apply/autofill) through `subscribeToSubmissionSuccess`.
   - The monitor dispatches a progress update (`updateProgress('Application', 'submitted', { message: 'Application submitted!' })`), clears the submit-attempt flag, logs to console, and now calls `reportLinkedInApplicationOutcome('Applied')` so outcome reporting works even when auto-apply is not active.
   - `ensureLinkedInSubmissionMonitor()` now runs whenever the content script detects a LinkedIn job context so the watcher is active outside auto-apply.
6. **Update auto-apply flow** to await the shared submission monitor (`awaitSubmissionSuccess`) instead of polling locally, keeping detection active even if the main loop exits early.
7. **Ensure cleanup** by stopping observers when no longer needed (modal dismissed, success dialog detected, page navigation) to avoid leaks when users navigate—expose a `stopEasyApplyMonitor()` helper for explicit teardown when flows end or the user navigates away.

## Testing & Verification
- Manual QA: run auto-apply and close the modal early → verify the monitor fires dismissal and the main loop exits gracefully.
- Manual QA: leave the modal open until the review step → confirm the monitor detects the review page without blocking the autofill flow.
- Manual QA: submit an application → ensure the submission monitor reports success whether or not auto-apply is active.
- Navigation smoke test: move between LinkedIn job pages and other sites to confirm the submission monitor attaches only on LinkedIn and tears down cleanly elsewhere.
- Regression pass: confirm JobGen action buttons still mount (helper exports remain compatible).

## Follow-up Considerations
- Consider logging hooks (via progress emitters) for monitor state transitions to aid debugging.
- Evaluate whether the monitor should expose a `status` enum for easier UI integration.
