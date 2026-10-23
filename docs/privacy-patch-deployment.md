# Privacy patch: rollout and recovery

This patch addresses three boundaries: birth-year delivery through the API, informed choice about shared Cohort familiarity statistics, and incomplete account deletion. It does **not** change cohort email eligibility, the profile-claiming model, or cross-account browser tool storage. No production migration or real account deletion is performed by the tests.

## Behavior

- `students.birth_year` remains for old clients but is constrained to NULL. Existing years are moved to `student_private`, whose RLS allows only the account linked to that profile to read/write its year. App admins have no exception. Ownership still means the current profile linkage; the deferred claiming/identity issue remains relevant. Other publicly entered fields such as age, birthday day and month are unchanged.
- `update_student_profile` saves the shared fields and private year in one transaction, rejects unexpected fields and enforces ordinary RLS. Admins can still edit shared profile fields. Older clients trying to write a non-null public year receive an error instead of leaking it.
- Cohort connection counts, constellation, weekly progress and continent summaries are retained. A versioned, optional sharing choice is shown in the Cohort tab, with the same explanation before sign-in and in About. It explains that current and past familiarity levels contribute, who can see the results, that comparing exact totals can sometimes reveal individual levels, and that notes/stars are excluded. The previous absolute anonymity promises are removed. This is an explicit product choice to retain the feature, not a claim to have eliminated inference.
- No account is automatically opted in. Only the account can set its choice through `set_cohort_consent`; the server checks the notice version and records the timestamp. App admins cannot opt someone else in. A connection enters every shared calculation only when **both people** currently opt in. This includes the earliest date of the weekly series, node counts, group sizes and denominators. The UI labels the coverage as participating students rather than the entire cohort. A member can view aggregates without contributing their own connections.
- Unchecking the choice excludes the account's connections and history from future Cohort calculations without deleting personal records or disabling personal Stats. It cannot retract totals previously seen or copied. A new notice version requires a fresh opt-in; withdrawal remains possible from an older client. Consent records cascade when the account is erased. Pending erasure accounts are excluded immediately. Admin usage reporting and coffee matching are unchanged; this choice specifically controls the shared Cohort view.
- Admin **Delete account** invokes a server-side Edge Function. It verifies the bearer token with `Auth.getUser`, checks the caller's admin status, and validates that actor again in a service-only SQL function. The browser never receives a service-role key.
- A private retry job blocks the target account's member access and new photo uploads. Storage cleanup includes current and old profile uploads, event-photo paths, and all objects owned by the account, including abandoned uploads. It uses the Storage API, then hard-deletes Auth. User-owned foreign keys cascade, including the profile, private year, outbound/inbound relationships and history, tool backups, activity records, event/RSVP records, newsletters/checks, coffee entries/matches, formal bookings and study joins. Explicit email allowlist entries are removed too.
- Auth deletion also removes content hosted by that account (events, formal/study sessions and their dependent bookings). Other people's unrelated accounts/data are retained. Admin accounts must first have their admin role removed by another operator; the endpoint does not erase an active admin account.
- Failed requests remain pending, with **Retry deletion** available in Admin even if the profile has already disappeared. Cleanup uses batches of 100 and a bounded request budget. Large accounts may require several retries. The operation reports success only after checking that matching Storage objects and the Auth account are gone and removing the profile and retry record.

## Rollout order

1. Review the existing project schema and take an appropriately protected backup. On a staging Supabase project, apply `supabase/schema.sql` for a new database or `supabase/migrations/202610220001_privacy_boundaries.sql` for an existing installation. Both are transactional and idempotent. This unmerged PR revises the same migration file; if an earlier draft was applied to staging, re-run the current migration there. The test suite verifies their privacy sections are identical. If using CLI migration history, record this migration using the team's normal process; this repo previously deployed via the SQL Editor.
2. Deploy `delete-student` from this repository with the Supabase CLI: `supabase functions deploy delete-student --project-ref YOUR_PROJECT_REF`. `supabase/config.toml` disables only the gateway's legacy JWT check; the handler itself always verifies the user with Auth and requires an admin. Keep these together. The built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-side function environment variables, never `VITE_*` values.
3. If needed, set the function's `DELETION_ALLOWED_ORIGINS` secret to a comma-separated list of exact frontend origins. Defaults are `https://blavafriend.app`, `https://www.blavafriend.app`, and `https://blavafriend.vercel.app`. Add localhost only in a development project. Preview domains are not implicitly trusted.
4. Deploy the frontend from the same revision. Coordinate the short transition: old year edits and profile-only DELETE requests fail closed after the SQL patch; new clients require the new table/RPCs. Do not restore the old DELETE policy or public birth years to work around errors.
5. With **disposable staging accounts**, test a normal member, a second member and an admin: owner-only birth-year reads/edits; direct public year writes rejected; an unchecked sharing choice on existing accounts; no connections/history included until both parties opt in; live aggregates after consent; withdrawal and refresh persistence; normal personal Stats; no direct profile-only deletion. Verify a real staging Storage object returns unavailable after deletion, the account is absent in Auth, and its server-side data is gone. Test more than 100 files, a forced mid-cleanup failure, retry after an Auth deletion, and stale access tokens. Do not use real classmates' accounts as test fixtures.
6. Apply the reviewed migration and function to production before deploying the frontend. Confirm production behavior separately; local tests are not proof of live deployment.

## Recovery and limits

Use Admin's **Unfinished account deletions → Retry deletion**. Project operators can inspect `account_deletions` privately in the dashboard to find stuck jobs, then retry the same `student_id` through the endpoint using a verified admin session. Do not manually delete Storage metadata: that leaves orphaned files. Do not delete a retry record to suppress an error or reassign a pending profile. Do not roll back the FK/policy changes while a deletion is pending. Function errors deliberately omit raw user data and upstream error details.

Deletion covers the application's **live hosted account and data**. It cannot erase copies already downloaded by classmates, browser/CDN caches, or provider backups/logs. Other users' independent copies or free-text mentions are not automatically edited. Local tool data remains on devices under the separately deferred browser-storage issue; users should clear site data on their devices. Confirm provider retention with the project owner and reapply recorded erasures before serving a restored backup. The deletion job itself is removed after success; retain any operational erasure record only under the project's agreed private retention policy.

The local tests run PostgreSQL via PGlite with modeled Supabase Auth/Storage tables, grants and roles, plus an injected Edge handler. They validate schema/RLS/cascades and request sequencing/failure behavior. They do not emulate GoTrue's own internal tables, Storage's object backend/CDN, or deployed Edge infrastructure; the staging checks above are required for release.

## Verification

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run lint
# With Deno installed, check the actual Edge adapter before deployment:
deno check supabase/functions/delete-student/index.ts
```

Supabase references: [hard-delete an Auth user](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [delete files through the Storage API](https://supabase.com/docs/guides/storage/management/delete-objects), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth).
