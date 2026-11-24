# JobGen.AI Chrome extension — handover candidate 1.3.3

React 19 / Vite / Chrome Manifest V3 extension for JobGen job matching, saved jobs, profile assistance and application autofill.

This repository was recovered from a source ZIP after a developer handover. Local build, lint and fixture tests pass. Authenticated backend and live job-site acceptance have not been performed because company access is unavailable. See [HANDOVER.md](HANDOVER.md) for current status and remaining work; the original audit is historical evidence.

See [CURRENT_STATUS.md](CURRENT_STATUS.md) for the latest verification and outstanding release blockers. Older audit documents describe earlier snapshots.

## Run locally

Use Node from `.nvmrc` (22.19.0); local verification also runs on Node 24.21.0.

```sh
npm ci --ignore-scripts
npm run lint
npm test
npm run build
```

Load `dist/` through Chrome → Extensions → Developer mode → Load unpacked. Build the current source locally; old compiled archives are excluded from the GitHub upload.

```sh
npm run test:coverage
npm run package
```

Packaging additionally needs Python 3. It creates extension/source ZIPs and SHA-256 checksums in `release/`. Local environment files, node_modules and old ZIPs are excluded. Development source maps are excluded from the production build.

## Platform scope

| Platform | Client implementation | Verification |
| --- | --- | --- |
| LinkedIn | Extraction, matching, optimisation, autofill and continuous apply | Selected fixtures/regressions; live acceptance pending |
| Indeed | Extraction, matching, autofill and continuous apply | Selected fixtures/regressions; live acceptance pending |
| SEEK | Extraction, matching, manual autofill, continuous apply and confirmed-submission tracking | Selected fixtures/regressions; live acceptance pending |
| Microsoft Careers | Existing page-specific autofill and document helpers; manual submission | Live acceptance pending |
| Glassdoor / iCIMS | Standard HTML text/select/radio/checkbox autofill; manual documents and submission | Synthetic form fixtures; custom widgets and external redirects unverified |

Microsoft, Glassdoor and iCIMS do not expose automatic submission. The client does not fill password fields. Existing answers are preserved by the standard-form adapter. Unknown/custom fields and file uploads on that adapter require user review.

## Backend configuration

Existing workflow endpoints are listed in `BACKEND_CONTRACT_CHECKLIST.md`. No backend source or credentials are included.

The old subscription check created a synthetic application request. That behavior has been removed. Leave `VITE_SUBSCRIPTION_URL` empty until the backend owner supplies a read-only HTTPS entitlement endpoint. The optional response contract and allowed hosts are documented in `.env.example`. Configure through `.env.local` and rebuild. When unavailable, subscription is unknown; actual backend operations continue enforcing authentication and subscription requirements. This does not grant server permissions.

## Tests and release status

`tests/api.test.js` exercises session changes, cached-user isolation, request deadlines, auth/subscription errors, malformed responses and selected workflow contracts. `tests/regressions.test.js` exercises routing, DOM fixtures, UI authentication transitions, autofill and submission confirmation. Tests block real network calls and send no real applications.

Native Node coverage does not include modules evaluated through Vite's JSX loader; its percentage is not overall application coverage. CI configuration runs lint/tests/build on Node 22.19.0 and 24, but that remote workflow has not run here.

The project has no recovered Git history. `audit/source-baseline.json` identifies the original uploaded snapshot. Historical local patches and raw captured profile pages are excluded from the GitHub upload.

See `HANDOVER.md`, `HANDOVER_SETUP.md`, `RELEASE_NOTES.md` and `BACKEND_CONTRACT_CHECKLIST.md`. Repository ownership and licensing should be confirmed by the company; this handover introduces no new license grant.

## Browser user journeys

See USER_TEST_REPORT.md: 12 automated browser journeys pass with simulated Chrome APIs/backends. Run npx playwright install chromium, then npm run test:browser. These checks do not certify native extension installation or real job-site integration.

## DOM maintenance tooling

See DOM_MAINTENANCE.md for the selector inventory, read-only DevTools diagnostic, local fixture checks and repair checklist. Run npm run audit:dom after source updates. This tooling does not change application selectors or establish current live-site compatibility.

## Native public-page follow-up — 17 November 2026

See NATIVE_PUBLIC_CHECKS.md for the latest status: native MV3/storage, live SEEK injection/panel interactions and sampled public SEEK selectors now pass in matching Chromium. LinkedIn public injection was observed; Indeed returned 403. This supersedes the earlier native-startup limitation for this test environment only. Authenticated application and backend acceptance remain pending.

## Auto-apply stopping-rule update — 1.3.2

See FLOW_STOP_REVIEW.md: key advance/submit paths now stop on incomplete or invalid forms, failed/busy uploads, interrupted pages and uncertain transitions. The 65-test suite and 12 browser fixture journeys pass; live signed-in acceptance remains required. Latest packages are jobgen-source-1.3.2.zip and jobgen-extension-1.3.2.zip.
