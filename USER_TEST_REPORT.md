# Browser user-flow tests — 17 November 2026

Result: **12/12 automated browser journeys passed** against the production UI bundle in Chromium 158.0.8127.18. The separate 40-test regression suite also passes, and lint/build pass.

These are automated user-journey checks, not interviews or usability sessions with people. Chrome extension APIs and all website/backend traffic were simulated. No real login, employer interaction or job submission occurred.

## Tested journeys

1. Built UI loads without a browser runtime exception.
2. Signed-out users see sign-in rather than application controls.
3. Login panel minimises and reopens.
4. Keyboard Enter activates sign-in and opens the correct JobGen login URL.
5. A simulated authenticated session opens the main panel.
6. Recent applications shows an empty-history state from the fixture response.
7. The signed-in panel minimises and reopens.
8. Save changes to Saved and sends exactly one fixture save request.
9. A simulated history server failure displays an error; Retry recovers to the empty-history state.
10. The header control stays within the viewport at 1024px desktop width.
11. Removing the simulated session returns to login.
12. No page runtime errors occur across these journeys.

## Issues found and fixed

- Icon-only header/minimised controls lacked useful accessible labels. Added labels for Back, Profile, Progress, Minimise and Open JobGen.
- The retry button's decorative icon affected its accessible name. Added an explicit action label.
- History failures displayed internal error codes such as HTTP_ERROR. They now display the readable API error detail or a plain-language fallback.

## Evidence and reproducibility

- `audit/user-tests/results.json`: final per-journey results and browser version.
- `audit/user-tests/browser-initial.png`: signed-out view.
- `audit/user-tests/signed-in.png`: authenticated fixture view.
- `audit/user-tests/history-error.png`: simulated server-error view.
- `browser-tests/user-flows.mjs`: browser suite using the actual dist bundle, simulated storage/session events and intercepted HTTP responses.

Run `npm ci --ignore-scripts`, `npx playwright install chromium`, then `npm run test:browser`. A machine with an existing compatible browser can set PLAYWRIGHT_CHROMIUM_EXECUTABLE to its executable path. This run used an already-installed headless Chromium executable through that override. Tests require permission to launch a browser process.

## Not verified

Native unpacked-extension startup was attempted in isolated profiles but did not complete reliably: one attempt failed during browser/crashpad startup, another had an unavailable Chrome storage API in the service-worker context, and retries timed out waiting for a worker. Consequently extension installation, MV3 permissions/service-worker behavior, frame dispatch in real tabs and real job-site integration are **not certified** by these results.

Real authentication/subscription states, uploads, auto-apply, progress across full-page navigation and backend outcome/history consistency still need company staging access and authorised test jobs. Progress/routing/confirmation have earlier unit/DOM regression coverage, but were not end-to-end browser-tested here. Narrow/mobile layouts were not tested; this is a desktop extension.

Human user testing remains pending. Suggested company session: ask a representative user to sign in, inspect a match, save a job, review history, autofill an authorised test form and recover from a staged failure while an observer records confusion and completion.

## Native public-page follow-up — 17 November 2026

See NATIVE_PUBLIC_CHECKS.md for the latest status: native MV3/storage, live SEEK injection/panel interactions and sampled public SEEK selectors now pass in matching Chromium. LinkedIn public injection was observed; Indeed returned 403. This supersedes the earlier native-startup limitation for this test environment only. Authenticated application and backend acceptance remain pending.
