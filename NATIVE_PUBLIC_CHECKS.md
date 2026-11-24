# Native extension and public-site checks — 17 November 2026

The previous native-startup blocker is resolved for the matching Playwright Chromium build. This is a limited native smoke test, not full job-application acceptance.

## Verified with the actual extension

- Matching full Chromium 159.0.8154.6 was installed through Playwright. A fresh persistent context loaded the production dist directory using the chromium channel.
- The Manifest V3 service worker reported version 1.3.1, a real extension ID, and the native chrome.storage.local API.
- The content script injected on a live public SEEK job page: https://au.seek.com/job/95747845.
- The native extension showed its sign-in panel; minimising and reopening it worked.
- Existing SEEK selectors matched the title, advertiser/company, location, description and apply control on that sample page. The zero-count company selectors are alternate listing-page fallbacks; the primary advertiser-name selector matched, so they are not evidence of a defect.
- The content script also injected on a logged-out public LinkedIn search page. Authenticated LinkedIn job forms were not examined.

## Access limits and errors

Indeed returned HTTP 403 with a Blocked page. Its extraction/application compatibility remains unverified; no attempt was made to bypass the block.

The test aborted non-read HTTP requests and all JobGen requests. This prevented submissions and isolated a signed-out smoke test, but it can also disrupt website scripts. Captured errors had LinkedIn static-script stack locations, not chrome-extension bundle locations. No extension-origin page error was captured in this run; that does not prove absence of all background/console errors.

Authenticated applications, resume/cover-letter uploads, next-step behavior, final submission, subscription enforcement, backend contracts and outcome/history consistency remain pending. No real jobs were applied for. The user's existing Google Chrome profile and company accounts were not used.

## Evidence and rerun

- audit/native-public/results.json contains service-worker, injection and selector observations.
- audit/native-public/seek.png shows the actual extension panel on the live SEEK page.
- audit/native-public/linkedin.png and indeed.png record the public pages/access limit.
- browser-tests/native-public.mjs is the read-only test script.

Run npx playwright install chromium, then npm run test:native-public. Unlike test:browser, this command visits real public pages. The sampled job URL can expire; update the test to another observed public job URL if necessary. Missing access or an expired job is not automatically a selector regression.

The supported launch setup follows Playwright's extension documentation: https://playwright.dev/docs/chrome-extensions. It requires a persistent Chromium context and extension-loading arguments. This check did not require Chrome API shims or a simulated backend.

## Next work requiring company input

Use authorised accounts/test jobs to exercise the actual failing application steps. Public-page matching alone cannot establish auto-apply reliability. No application selector was changed in this step because the sampled SEEK selectors matched their intended elements.
