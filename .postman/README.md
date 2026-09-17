# Postman collections

Two collections, one per side of the Handi API:

- **`collection-admin.json`** — Handi-Admin (44 requests: Authentication, KYC,
  Jobs, Transaction, Operations, Disputes, Users, Withdrawal Requests, Service
  Categories, Analytics, Contact, Dashboard Summary). Imported for the `Admin`
  context.
- **`collection-user.json`** — Handi (93 requests: Onboarding, Notification,
  Wallet, Chat, User, Referral, Job, KYC, Artisan, Service Categories, App,
  Contact, Reports, Waitlist). Imported for both the `User` and `Provider`
  contexts — same API, different `role` at login.

Both are what the two `postman` jobs in
[`../.zap/automation.yml`](../.zap/automation.yml) import to seed ZAP's
sitemap before crawling/scanning.

Both are trimmed exports: the captured example `response` blocks (stale JWTs,
sample phone numbers/emails, IDs) were stripped before committing — ZAP's
`postman` job only reads `request` definitions, so nothing functional was lost.

## Keeping them in sync

Re-export from Postman (**Collection → Export → Collection v2.1**) and
overwrite the relevant file whenever routes change. Strip `response` arrays
again before committing (they're not needed and tend to carry stale
tokens/PII):

```bash
python3 -c "
import json
path = '.postman/collection-admin.json'  # or collection-user.json
d = json.load(open(path))
def strip(items):
    for it in items:
        it.pop('response', None)
        if isinstance(it.get('item'), list):
            strip(it['item'])
strip(d['item'])
json.dump(d, open(path, 'w'), indent='\t')
"
```

## Variables

Both collections reference `{{handi-base-url}}` and have no stored default —
each `postman` job in `automation.yml` resolves it via its `variables`
parameter (`handi-base-url=${TARGET_URL}`). If a re-export introduces new
unresolved `{{...}}` variables, add them to that job's `variables:` line
(`key1=value1,key2=value2`).

## Login

Documentation only — ZAP does its own login, it never replays these Postman
requests. Keep them in sync if the login endpoint, field names, or response
shape ever change.

- **Admin** — `Authentication > Sign In` in `collection-admin.json`
  (`POST {{handi-base-url}}/auth/admin/signin`,
  `{"email":...,"password":"{{admin-passwd}}"}`) mirrors
  `automation.yml`'s Admin context (`authentication.method: json`).
- **User/Provider** — `Onboarding > Sign In` + `Onboarding > Verify Phone
  Number` in `collection-user.json` mirror
  [`../.zap/scripts/otp-signin-auth.js`](../.zap/scripts/otp-signin-auth.js),
  which performs both requests (`role`+`phoneNumber` → `sessionId`, then
  `sessionId`+`phoneNumber`+`code` → `data.idToken`). `role` is `"USER"` for
  the User context, `"ARTISAN"` for Provider.

## Excluded from active scan

**Admin**: `automation.yml`'s `excludePaths` skips the money-moving and
account-banning routes (withdrawal approve/reject/fail, user disable/enable)
directly — not behind a toggle. Everything else — KYC review, dispute
resolve, job cancel/complete, artisan featured-toggle — is left in scope
deliberately, since catching authz/injection bugs in admin actions is the
actual point of this scan.

**User/Provider**: session-breaking routes (`/auth/logout`,
`/auth/change-phone-number`) are always excluded. Everything else with a
real-world side effect — SMS/OTP, job-notification, chat/contact,
payment/bank, destructive deletes — lives in
[`exclude-categories.yml`](../.zap/exclude-categories.yml) and is toggled per
run from `dastscanner.yml`'s `exclude-*` workflow inputs (default: all
excluded). See the root [`README.md`](../README.md#exclusion-toggles) for the
toggle list, and `exclude-categories.yml`'s header for the caveat that ZAP
excludes by URL pattern, not HTTP method, so a couple of read-only GETs on the
same path shape as a mutating route get excluded too as a simplicity
trade-off.
