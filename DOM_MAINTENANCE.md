# Keeping auto-apply working when site DOMs change

The manager described an existing working extension that needs periodic DOM updates. The tools in this document help locate and reproduce those failures. They do not automatically rewrite selectors or submit applications.

## Current inventory

Run `npm run audit:dom`. It scans the local source with a JavaScript/JSX parser and generates:

- `audit/dom/selectors.json`: 510 selector call sites at this checkpoint, with file, line, method and literal selector where available.
- `audit/dom/browser-probe.js`: a standalone read-only script for DevTools.

74 expressions are dynamic and deliberately not evaluated by the inventory. Counts are call sites, not unique selectors or proven failures. The scanner recognises querySelector, querySelectorAll, closest, matches and waitForElement calls. Computed property names, additional custom wrappers and runtime-built selectors can be missed. Regenerate after changing source so line numbers remain current.

## Where to look first

| Site / function | Main files |
| --- | --- |
| LinkedIn form filling / next step | src/autofill/linkedin.js |
| LinkedIn modal and submission monitoring | src/utils/linkedinHelpers.js |
| Indeed form filling / apply | src/autofill/indeed.js |
| SEEK manual form filling | src/autofill/seek_autodill.js |
| SEEK continuous application flow | src/autofill/seek_simple.js |
| SEEK questions / document controls | src/utils/seekHelpers.js |
| Job title, company, description and job identity | src/utils/siteExtractors.js |
| Microsoft page-specific forms | src/autofill/microsoft.js |
| Glassdoor / iCIMS standard fields | src/autofill/standardForm.js |

## Diagnose a reported failure

1. Record the extension version, site, application step and what the user clicked. Distinguish missing elements, changed frame/modal structure, validation errors, and backend failures.
2. Reproduce on an authorised test application. Stop before final submission unless that test submission has been explicitly authorised.
3. In DevTools, select the correct frame. Read `audit/dom/browser-probe.js` first, then run it in that frame's console. The returned array lists selector counts and source locations; use it to narrow the investigation.
4. Check the affected element and its ancestors, visibility, disabled state, associated label, iframe and shadow-root placement. The diagnostic only queries the current document; it does not enter frames or shadow roots.
5. A zero count is not automatically a defect. Most selectors belong to other sites, steps, variants or optional fields. A count for a closest/matches selector is a document observation, not a reproduction of the original operation. Invalid/unsupported counts may reflect selector-engine support rather than a broken website.
6. For dynamic selectors, inspect the runtime argument at the reported source line. The tool never executes expressions extracted from the source.

The diagnostic reads selector counts only. It does not read input values, text, HTML, cookies, tokens or URLs, send data, mutate the page, or click controls. Review the returned report before sharing: even source selectors and page structure can reveal internal implementation details.

## Create a regression fixture

Create a small synthetic or redacted local HTML file for the broken step. Keep the required attributes, element hierarchy and control states. Remove actual names, emails, resumes, hidden input values, scripts, tokens, URL query strings and employer/application identifiers. Do not copy a complete authenticated page into a distributable fixture.

You can inspect a local fixture with:

```sh
node scripts/dom-audit.mjs fixture /absolute/path/to/redacted-step.html src/autofill/seek
```

This prints observations as JSON. It intentionally does not exit with failure for missing selectors: absence is expected when a fixture covers only one application step. Convert the specific expected behavior into a focused regression test instead. Current tool tests in tests/dom-maintenance.test.js verify drift detection, dynamic-expression handling, invalid-selector recovery and read-only behavior.

## Make and validate a selector update

- Change the failing site's smallest relevant lookup. Prefer stable site-provided data attributes or accessible labels when present; inspect the current page rather than guessing a fallback.
- Keep fallbacks specific to the same control/step. A broad button[type=submit] or a button containing Apply can click the wrong control.
- Exercise the old supported variant and the new fixture; include delayed loading, hidden/disabled controls, frame boundaries and a missing required field.
- Preserve job-identity checks, duplicate-run locks, user review controls and positive submission confirmation. Missing confirmation means unconfirmed, not Applied.
- Run npm run lint, npm test, npm run build and npm run test:browser. The browser suite uses fixtures; follow it with authorised live-site acceptance when access is available.
- Regenerate the inventory with npm run audit:dom and package with npm run package. Record the selector change, affected step and evidence in release notes.

## Status of this work

The maintenance tooling was added without changing application selectors or auto-apply control flow. No current site breakage was assumed from an unmatched selector. The 44-test suite passes locally, including four new diagnostic-tool tests. Current-browser DOM captures, company staging access and actual user reports remain necessary to verify live selector repairs.
