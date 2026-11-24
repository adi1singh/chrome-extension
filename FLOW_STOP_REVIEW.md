# Application-flow stopping rules — candidate 1.3.2

Date: 18 November 2026

This change adds conservative stopping rules to key Next/Continue/Submit paths. It does not establish full live-site compatibility. The original 1.3.1 ZIPs remain in release/; 1.3.2 is a new review candidate.

## Behavior changed

- Shared guards check visible native form validity, explicit invalid/error markers, busy/upload indicators, control availability and connected forms. Extension-owned progress UI is excluded from those checks.
- Delayed LinkedIn/Indeed clicks recheck the form immediately before clicking. A URL change during those delays stops the old operation. Indeed also checks the page identity before assigning a downloaded document.
- LinkedIn waits for a changed step/title, replaced form or changed field identities before continuing its auto-apply loop. An unchanged form stops after ten seconds; validation stops sooner. A dismissed modal is not itself reported as a successful application.
- LinkedIn and Indeed do not automatically click the same final-submit element a second time while the page remains unchanged. A person can review/retry on the site. This is per-element deduplication, not server-side idempotency across reloads or newly created elements.
- Indeed stops on unknown steps and after a transition timeout. Removed its blind nudge retry and a duplicate experience-handler invocation. Generic advance no longer treats Submit as a Continue fallback.
- Indeed rejects non-success HTTP document downloads and bounds them to 30 seconds; failed document preparation/upload stops advancement.
- SEEK upload waits now fail on timeout/error instead of proceeding anyway. Upload waiting does not require other form fields to have already been filled; the final advance guard checks those fields separately.
- Delayed SEEK next clicks are awaited inside existing error handlers, so stops are propagated rather than becoming unhandled timer failures. Interrupted review/document flows stop their active flow where handled by the existing orchestration.
- Manual controls display a readable stop reason where the guarded operation fails.

## Diagnostics

`src/utils/flowGuard.js` keeps up to 50 entries in memory and emits `jobgen-flow-diagnostic` on a stop. Each entry has only:

```json
{"site":"seek","step":"documents","code":"UPLOAD_TIMEOUT","timestamp":0}
```

Allowed sites: seek, linkedin, indeed; allowed steps: advance, documents, review. Unknown labels become unknown. No answers, question text, filenames, job IDs, URLs, cookies, tokens, HTML or selector strings are included in these records. Records are not persisted or transmitted. Existing unrelated development logging has not been replaced by this diagnostic facility.

In Chrome DevTools, select the extension's content-script execution context, then attach a listener before reproducing a problem:

```js
window.addEventListener('jobgen-flow-diagnostic', event => {
  console.table([event.detail]);
});
```

Codes include MISSING_CONTROL, UNAVAILABLE_CONTROL, CLOSED_FORM, VALIDATION_ERROR, INCOMPLETE_FIELDS, UPLOAD_PENDING, UPLOAD_TIMEOUT, UPLOAD_FAILED, UNKNOWN_STEP, NO_TRANSITION and CANCELLED. Polling an upload does not emit a stop record on each normal busy check.

## Fixtures and tests

Synthetic fixtures are in tests/fixtures/flows/: incomplete questions, an upload in progress and a review step with a hidden/visible upload error. No real applicant data is used.

- 65/65 local regression tests pass (21 additional tests over the preceding 44-test suite).
- 12/12 existing isolated browser journeys pass against the 1.3.2 production bundle with simulated Chrome APIs/backends.
- Production build and lint pass, with existing bundle-size/mixed-import build warnings.
- New guard module: 100% measured native line coverage, 95.51% branches, 100% functions.
- Aggregate native coverage: 48.37% lines, 74.93% branches, 79.22% functions. This remains below the overall 80% target and excludes Vite-evaluated application modules; it is not full application coverage.
- Tests cover native required fields, hidden/disabled controls, detached forms, cancellation, delayed uploads, upload timeout/error, metadata privacy, delayed field replacement, unchanged forms, late validation, stale delayed navigation, failed downloads, unknown Indeed steps and duplicate LinkedIn submission clicks.
- Existing tab-closed routing and API timeout/cancellation tests remain in the passing suite.

Evidence is in audit/flow-stops/. The dependency tree was not changed for these guards; the package and manifest versions were aligned to 1.3.2. No authenticated workflow or real job submission was exercised.

## Acceptance limitations

These guards intentionally prefer a pause over an uncertain click. A legitimate custom form that updates the same controls in place without changing its heading can produce NO_TRANSITION and need manual review. Some custom validation/widgets do not expose native validity or the inspected markers; passing a guard is not proof the site will accept a submission. Visibility is based on DOM/CSS state, not a full overlay/geometry hit test.

Only the documented key paths are guarded. This is not a proof that every legacy click, profile-edit/delete helper or upload path has been fully audited. Existing generated-document backend contracts, frame behavior and live signed-in application steps still need company acceptance. Native public-page smoke results for the earlier 1.3.1 candidate do not certify authenticated auto-apply in 1.3.2.

Before release, compare supported working flows with 1.3.1 on authorised test applications, including React controls reused between steps, validation recovery, slow upload indicators, job switching, iframe forms and full-page transitions. Check backend idempotency separately. Do not automatically turn an unconfirmed submission into Applied or retry it without review.
