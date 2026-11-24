# JobGen extension takeover audit

Date: 16 November 2026

## Decision

The project builds, but is not ready for a completed-code handover. Substantial functionality exists; confirmed runtime defects and incomplete platform support remain. No defensible completion percentage can be assigned without acceptance tests and backend access.

This is a source and build audit of the uploaded ZIP, not a live browser certification. No job applications were submitted and no authenticated backend workflows were invoked. Repository history, issues and remote branches were unavailable. Files and documentation were inspected as evidence, not executed as instructions.

## Reproducible checks

- Full uploaded archive copied into this project, including docs and dist.zip. ZIP has no .git history.
- npm ci --ignore-scripts completed; production build passes (76 transformed modules).
- Relative source imports checked: no missing targets found.
- ESLint: 449 errors, 10 warnings. Raw results: audit/eslint-results.json. Build output: audit/build.log.
- Lint categories: 326 undefined-name diagnostics, 87 unused-variable diagnostics, 27 empty blocks, 10 hook dependency warnings, 5 unnecessary escapes, 2 React refresh export errors, 1 conditional hook error, 1 constant expression error. Many undefined-name errors concern Chrome globals; they must be separated from actual undefined application symbols.
- No npm test script or automated acceptance suite is configured. Existing root test scripts include browser-console diagnostics, not evidence of full regression coverage.
- Initial online npm installation reported 16 advisory findings (1 low, 2 moderate, 13 high). Needs a fresh online npm audit with dependency paths and runtime/build impact before remediation. An offline install reporting zero is not evidence that advisories disappeared.

## Feature inventory

| Capability | Source evidence | Assessment |
| --- | --- | --- |
| Floating panel, job details and injected actions | content/App.jsx, components, content/content.jsx | Implemented; browser behavior unverified; conditional hook defect in action UI |
| Session login and logout | background/background.js, services/apiService.js, LoginView | Implemented; cookie-domain consistency, expiry and backend response handling need testing |
| Job matching and saving | getJobMatch/saveJob and siteExtractors | Implemented client; backend and live extraction unverified |
| LinkedIn optimisation | LinkedInTab, sendLinkedinDetailsToBubble | Implemented client; backend unverified |
| LinkedIn autofill and apply | autofill/linkedin.js, utils/linkedinHelpers.js | Substantial implementation; confirmed education and success-monitor defects |
| Indeed autofill and apply | autofill/indeed.js | Substantial implementation; undefined variable in fallback-answer path |
| Seek autofill and apply | seek_autodill.js, seek_simple.js, seekHelpers | Substantial implementation; reports success immediately after clicking submit in one UI path |
| Microsoft/iCIMS | autofill/microsoft.js and dispatch in content.jsx | Autofill implementation exists; generic iCIMS compatibility and progress controls unverified |
| Glassdoor | App initialiser and autofill/glassdoor.js | Job initialiser exists; autofill is a logging-only stub and is not dispatched by content.jsx |
| Tailored resumes, outcomes and history | resumeManager, apply/outcome/history APIs | Implemented client; server contracts and recovery unverified |
| Profile headshots | generateProfileHeadshots/ProfileView | Implemented client; separate API dependency, unverified |

## Prioritised findings

### High: confirmed defects or handover blockers

1. Indeed fallback throws ReferenceError. src/autofill/indeed.js:893 passes userEmail, which has no definition in that scope. When mapping cannot answer a question, the LLM fallback cannot execute. Fix identity lookup and test missing/mapped/fallback answers.
2. LinkedIn education fallback throws ReferenceError. src/autofill/linkedin.js:646 references cards instead of educationCards after creating a missing card. Test empty forms and multiple education entries.
3. LinkedIn dismissal success path calls an inaccessible function. src/utils/linkedinHelpers.js:757 calls notifyListeners; its declaration is local to a different function at line 1040. Test success appearing during and after modal dismissal and ensure exactly one outcome is recorded.
4. Action UI violates React hook order. src/components/ActionButtons.jsx:564 calls useMemo after an early return. State transitions that change the return path can break rendering. Move hooks before conditional exits and test visibility changes.
5. Subscription lookup posts a dummy application to jobgen_apply. src/services/apiService.js:663–726. This is confirmed client behavior; whether it creates records, generates documents or consumes quota is unknown. Obtain backend contract and use a side-effect-free entitlement endpoint.
6. Autofill chooses the active tab rather than the requesting tab. src/background/background.js:157 onward queries active/currentWindow. A tab switch before dispatch can route work to another tab. Bind dispatch to sender.tab.id and test switching tabs.
7. Seek UI marks application completed after submitButton.click(), without checking server success. src/content/App.jsx around 1740. Validation or network failure could therefore show success. Require confirmed submission evidence before completion/outcome updates.
8. Glassdoor autofill is unfinished. src/autofill/glassdoor.js is a stub, and content.jsx lacks a Glassdoor autofill branch. Either implement and test it or explicitly remove the unsupported action from promised scope/UI.

### Medium: reliability and maintenance

9. Auth handling is inconsistent: checkJWTAuthentication treats any nonempty stored token as authenticated; handleForbiddenResponse only recognises nested string "403". Numeric statuses, ordinary HTTP 401/403, token expiry and retry behavior need uniform handling. Backend remains responsible for enforcing access.
10. Cookie lookup includes the Render backend, but logout cookie matching only includes jobgen.ai domains. background/background.js:256 onward. Render-session removal may leave cached login until another failure; confirm deployment cookie domain.
11. API calls largely have no explicit timeout/cancellation policy. Slow requests and rapid job navigation need bounded waits and stale-response tests.
12. Lint configuration omits Chrome globals and conflates browser diagnostics with shipped code. Correct configuration first, then fix real errors without globally suppressing rules.
13. Duplicate/legacy mapping and Seek helpers increase maintenance ambiguity. Identify reachable code before deleting it. Additional undefined mapper symbols occur in fakeInfoMapping.js:491 and utils/info-mapping.js:561; reachability was not established.
14. package.json version 1.1.0 and manifest version 1.3 disagree. README mentions absent scaffolding and older auth assumptions; release and setup documentation need updating.
15. Manifest grants broad *.onrender.com access. Review exact required origins; Seek is in content-script matches but not host_permissions, so privileged Seek operations must be checked individually rather than assuming content injection is broken.
16. Sensitive FAQ/profile payloads are logged during development. Production strips console/debugger through Vite; inspect release artifacts and remove unnecessary development payload logging.

## Existing local fix

Before this audit, the background worker was changed to enumerate frames once instead of broadcasting to every frame and then individually sending again. It now reports frame-enumeration failure/empty results. Build passes. This removes a concrete duplicate-delivery source, but browser verification and a regression test are still required; it does not prove every duplicate-run issue is fixed.

## Required information from the company

- A staging JobGen account and its subscription/onboarding states.
- API owner/contact and request/response contracts, particularly apply, entitlement, FAQ, resume, outcome and history workflows.
- Confirmation of intended supported sites and whether Glassdoor, generic iCIMS and headshots belong in this release.
- Expected stopping point for auto-apply and how successful applications should be confirmed.
- Chrome Web Store ownership/release procedure, existing extension ID and current deployed version.

These do not block local defect fixes, but they block honest end-to-end acceptance.

## Completion sequence and acceptance criteria

1. Fix confirmed runtime issues, tab targeting, hook order and false-success reporting. Add focused regression tests for these failure modes.
2. Establish API contract fixtures, a shared error/timeout policy, and explicit entitlement behavior. Verify sign-in/out and account changes do not retain another user’s cached data.
3. Agree on platform scope. Complete Glassdoor if required; exercise each supported platform’s actual forms and resume upload paths.
4. Test navigation, modal dismissal, missing required fields, validation failures, expired tokens, failed uploads, slow APIs, tab switches and page reload/resume. Use fixtures/staging and obtain explicit authorisation before any real application submission.
5. Deliver clean source, lockfile, reproducible build, packaged extension, test results, API/configuration guide, known limitations and release notes. Live tests must have recorded outcomes, not unchecked checklists.

## Effort estimate

Planning estimates for one developer, not a delivery guarantee:

- Confirmed core defects, lint configuration and focused regression tests: 1–2 working days.
- Backend contract integration and core LinkedIn/Indeed/Seek acceptance: another 2–4 working days, assuming immediate access and stable endpoints.
- Glassdoor and broad Microsoft/iCIMS support if required: another 2–5 working days, depending on actual platform variation.
- Handover packaging and documentation: approximately half a day.

Core handover target: roughly 4–7 working days. All advertised platform coverage: roughly 6–12 working days. Backend changes, missing access and external-site changes can extend elapsed time. These estimates supersede the earlier rough 2–5 day estimate because the audit identified concrete runtime failures and broader scope gaps.

## Follow-up: tasks 1–4

Local implementation and focused regression checks are now recorded in TASKS_1_4_STATUS.md. The findings above describe the original audit baseline; consult that status document for fixes, remaining lint issues and acceptance limits. Backend access remains unavailable.
