# 1.3.2 — conservative auto-apply stopping rules

Added form/control/transition guards, bounded upload failure handling and privacy-limited failure diagnostics. Removed Indeed blind nudge/unknown-step advancement and duplicate experience execution; prevent repeat clicks on unchanged LinkedIn/Indeed final-submit elements. Await delayed SEEK transitions inside error handlers. Added synthetic flow fixtures and 21 additional regression tests. See FLOW_STOP_REVIEW.md for scope, evidence and compatibility limits. Not production-accepted.

# 1.3.1 — local handover candidate

- Fixed Indeed fallback identity, LinkedIn education card selection and LinkedIn success dispatch errors.
- Fixed conditional React hook ordering and stale observer callbacks.
- Bound autofill dispatch to the requesting tab; deduplicated frame delivery and reported unreachable receivers.
- Removed submission-success assumptions; SEEK waits for confirmation and manual autofill stops at review. LinkedIn modal dismissal without confirmation remains unconfirmed.
- Added deadlines, typed HTTP/API errors, account-change protection and token expiry checks. Local token decoding is not signature verification; the backend remains authoritative.
- Clear account-specific storage on token changes; bind cached FAQ data to the requesting session and a five-minute cache lifetime.
- Removed the synthetic application used for subscription checks. Added opt-in read-only entitlement configuration and explicit unknown status.
- Added standard-form Glassdoor/iCIMS autofill; limited unsupported automatic submission actions in the UI. Microsoft’s completion copy now asks the user to review rather than asserting every field was filled.
- Resolved lint errors/warnings while preserving initializers and intentional unused positional arguments. Removed obsolete undefined mapper assignments and corrected environment declarations.
- Updated compatible dependency versions through npm audit fix; the saved online audit reports zero known advisories at verification time.
- Aligned package/manifest version to 1.3.1, removed unused OpenAI and wildcard Render host permissions, and added explicit SEEK host permissions.
- Disabled production source maps, added CI verification configuration and deterministic extension/source packaging.

Not deployed or published. Company backend contracts, representative live forms, document uploads, cross-page recovery, and current browser/site acceptance remain to be verified. Glassdoor/iCIMS custom widgets and external employer forms are outside the standard-control adapter’s implemented coverage.

Browser-test follow-up: added accessible icon/retry labels, readable history errors, and 12 browser user journeys. See USER_TEST_REPORT.md for fixture and native-installation limitations.
