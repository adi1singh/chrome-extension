# Backend contract checklist — task 5

Status: prepared; waiting on company access/contracts. The user confirmed no backend access is available. This document records client behavior, not verified server behavior. No external requests were made to test these workflows.

## Information the company needs to supply

1. Backend owner and staging base URL; test accounts for subscribed, unsubscribed, incomplete-onboarding and expired-session cases.
2. Authoritative request/response examples, HTTP statuses and nested Bubble status conventions for the endpoints below.
3. A read-only subscription/entitlement endpoint. The original checkUserSubscriptionStatus POSTed a synthetic subscription-check job to jobgen_apply. That request has now been removed. The optional VITE_SUBSCRIPTION_URL adapter uses GET and expects an explicit subscribed boolean; leave it unset until the company confirms the endpoint and response contract. No replacement endpoint is guessed.
4. Cookie domain, name, lifetime and refresh/logout behavior. Current client searches for jobgen_session on both JobGen and Render origins.
5. Whether apply generates documents/queue items or actually submits anywhere; job-ID conventions and idempotency rules for apply/outcome/save.
6. Resume/cover-letter response shapes, URL access requirements, expiry, CORS and supported document formats.
7. Whether Glassdoor, generic iCIMS and headshots are required for this handover.

## Observed client endpoints

Most workflows use https://candidates.jobgen.ai/api/1.1/wf/ and Bearer authentication from extension storage.

| Workflow suffix | Current client use | Contract questions |
| --- | --- | --- |
| jobgen_faq | Profile, personal_info, preferences, experience and education | Which fields are JSON strings versus objects? How is missing data represented? |
| jobgen_job_match | description, company, job_title, job_id, job_portal | Confirm score/job_data shapes and stable site job IDs |
| jobgen_save | job_url, job_id, job_title, company, job_portal, excitement, description | Upsert behavior and duplicate-save semantics |
| jobgen_apply | job_url, description, cover_letter yes/no, company, job_title, job_id, job_portal, updated_resume yes/no | Document generation, queue side effects, limits and retry/idempotency contract |
| jobgen_apply_question | Question/prompt and options; differing legacy payloads | Accepted payload, authenticated identity and answer schema |
| jobgen_apply_outcome | application_status, job_id, error, job_portal | Accepts Applied/Failed/Withdrawn/Need review; is repeated reporting idempotent? |
| jobgen_history | History retrieval | JSON string versus array, pagination and canonical status mapping |
| jobgen_linkedin_data | profile_url, description | Optimisation response and ownership rules |

Headshots separately use https://api.jobgen.ai/api/nanobanana/generate. Login token acquisition also depends on the website/backend session; confirm its endpoint and cross-origin credentials contract from the deployed auth implementation.

## Acceptance cases once access is provided

- Login, expiry, refresh, logout and account switching clear/update the correct user data.
- Subscription check does not create an application or consume generation quota.
- 401/403/402 and nested statuses have consistent user-facing handling.
- Matching and saving show real response data and do not overwrite a newly selected job with a stale result.
- Tailored resume on/off and cover letter on/off return valid uploadable files.
- Outcome and history agree only after confirmed submission; duplicate notifications do not create duplicate records.
- Timeout, malformed JSON and server failures leave recoverable state.

Following tasks 1–4, shared timeout/error/session handling and an opt-in entitlement adapter were implemented. Fixture tests check client contracts, but task 5 still requires the company’s authoritative contracts and staging access before integration can be accepted.
