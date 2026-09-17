# DASTSCANNER

Authenticated, Postman-seeded, full active DAST scanning via OWASP ZAP's
Automation Framework, run from GitHub Actions ([`dastscanner.yml`](dastscanner.yml)).
Scans all three Handi roles in one run — **Admin**, **User**, **Provider**
(artisan) — each with its own login and its own active scan.

⚠️ `activeScan` fires real attack payloads (SQLi, XSS, etc.) at the target.
Only run this against systems you're authorized to test. The workflow rejects
any `target-url` containing `prod` unless `allow-production: true` is set, and
requires typing `confirm-authorized: yes` on manual runs.

## How it fits together

- [`dastscanner.yml`](dastscanner.yml) — the GitHub Actions workflow. Resolves
  and validates the target URL, merges the active-scan exclusion toggles (see
  below) into the plan, runs ZAP in Docker, uploads SARIF to code scanning
  plus HTML/JSON report artifacts.
- [`.zap/automation.yml`](.zap/automation.yml) — the ZAP Automation Framework
  plan: three contexts (Admin/User/Provider), their logins, crawl, active
  scan, and report jobs.
  - Admin: JSON auth against `POST /auth/admin/signin` (email/password ->
    bearer `data.idToken`).
  - User/Provider: two-step phone+OTP login (`POST /auth/signin` ->
    `POST /auth/verify-phone-number`) via
    [`.zap/scripts/otp-signin-auth.js`](.zap/scripts/otp-signin-auth.js) —
    ZAP's built-in JSON auth method can't do a two-request login, so this is a
    custom authentication script. **Untested against the real API** — see the
    script's header comment for what to verify before trusting it in CI.
- [`.zap/exclude-categories.yml`](.zap/exclude-categories.yml) — User/Provider
  active-scan exclusions grouped by real-world-side-effect category (SMS cost,
  push-notifying real other users, payment/bank calls, irreversible deletes).
  Each category is toggled per run via `workflow_dispatch` inputs, default
  excluded (safest) — see **Exclusion toggles** below.
- [`.postman/collection-admin.json`](.postman/collection-admin.json) /
  [`.postman/collection-user.json`](.postman/collection-user.json) — the real
  Postman exports ZAP imports to seed its sitemap. See
  [`.postman/README.md`](.postman/README.md) for how to keep them in sync.

## Setup checklist

- [x] Both Postman collections in place (`.postman/collection-admin.json`,
      `.postman/collection-user.json`).
- [x] `.zap/automation.yml` — all three contexts wired up (Admin JSON auth,
      User/Provider script auth).
- [ ] **Load `.zap/scripts/otp-signin-auth.js` into ZAP Desktop and test one
      login manually** (right-click context → Users → test) before relying on
      it in CI — it's written from ZAP's documented scripting API but not run
      against Handi's dev environment yet.
- [ ] **Verify `loggedOutRegex`** for the Admin context in `.zap/automation.yml`
      — no captured failed-login example exists, so it's a best guess. Do one
      manual bad-password login against the dev API and confirm/adjust.
- [ ] **Confirm the fixed test OTP code** (`DAST_TEST_OTP`) actually works
      against your User/Provider test phone numbers on the dev environment.
- [x] `excludePaths` — Admin: money-moving/account-banning routes excluded.
      User/Provider: session-breaking routes always excluded; SMS/job-notify/
      chat-contact/payment-bank/destructive routes excluded by default via
      toggles (see below) — review `.zap/exclude-categories.yml` if you want
      the category boundaries redrawn.
- [ ] Set the repo/org **Actions variable** `DAST_STAGING_URL` (default target
      for scheduled runs and manual runs that omit `target-url`) — point it at
      the dev API.
- [ ] Set the repo/org **secrets** below.

## Required secrets

| Secret | Used for |
|---|---|
| `DAST_ADMIN_USERNAME` | Admin login **email** (e.g. `admin@tryhandi.com`) — field is `email`, not a username |
| `DAST_ADMIN_PASSWORD` | Admin login password |
| `DAST_USER_PHONE` | Phone number of an already-onboarded test account with `role: USER` |
| `DAST_PROVIDER_PHONE` | Phone number of an already-onboarded test account with `role: ARTISAN` |
| `DAST_TEST_OTP` | The dev environment's fixed test OTP code accepted for the above numbers |

Optional, only if your target is on a private network (see the commented-out
Tailscale step in `dastscanner.yml`):

| Secret | Used for |
|---|---|
| `TAILSCALE_OAUTH_CLIENT_ID` | Tailscale connect step |
| `TAILSCALE_OAUTH_SECRET` | Tailscale connect step |

## Exclusion toggles

Five `workflow_dispatch` boolean inputs, each **default `true` (excluded —
safest)**, control whether a risk category of User/Provider endpoints is in
scope for active scan:

| Input | Excludes |
|---|---|
| `exclude-sms-otp` | `/auth/resend-otp` (real SMS cost/rate-limit risk) |
| `exclude-job-notifications` | Job create/redispatch/quote/cancel/complete (can push-notify real other users) |
| `exclude-chat-contact` | Chat send, contact form, waitlist (reaches a real counterparty or inbox) |
| `exclude-payment-bank` | Payment session, bank resolve, withdrawal creation |
| `exclude-destructive` | Irreversible deletes (service, withdrawal request) |

Set any to `false` in the manual "Run workflow" form to include that category.
Scheduled runs always use the defaults (all excluded).

## Running it

- **Scheduled**: Mon–Fri 02:00 UTC against `DAST_STAGING_URL`, no manual
  confirmation needed, all exclusion categories on (safest).
- **Manual**: Actions → DAST Deep Scan → Run workflow. Fill in `target-url`
  (or leave blank to use `DAST_STAGING_URL`), type `yes` into
  `confirm-authorized`, set `allow-production: true` only if you actually mean
  to scan a production URL, and flip any `exclude-*` toggle to `false` if you
  want that risk category actively scanned this run.

Findings land in the repo's Code Scanning tab (SARIF) and as downloadable
`dast-reports-<run-id>` workflow artifacts (JSON + HTML). A High-risk finding,
plan error, or Docker/ZAP crash fails the job; Medium-risk findings are
reported as a warning and do not block.
