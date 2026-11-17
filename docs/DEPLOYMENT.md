# Deployment readiness (Phases G–J)

Firebase Hosting is the recommended static host for this Vite application, which
already uses Firebase Authentication. The root `firebase.json` serves only
`frontend/dist`, rewrites client routes to `/index.html`, and applies no-cache,
nosniff and strict-origin referrer headers. Conservative revalidation avoids stale
HTML referencing removed lazy chunks. This does not deploy the Flask API or rules.
Configuration reference: https://firebase.google.com/docs/hosting/full-config

## Local and CI checks

From the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
python -m pip install -r requirements.txt
python -m unittest discover -s tests
git diff --check
```

Use Node 22.16+ (CI uses Node 24), Python 3.12 and an isolated Python environment.
GitHub Actions runs these application checks on main pushes and pull requests.
It has read-only repository permissions and no deployment credentials. CI builds
without Firebase configuration check compilation only; they are not deployable
production artifacts. Remote CI has not run for these uncommitted changes.

## Configure and release after approval

1. Copy `frontend/.env.example` to ignored `frontend/.env.production.local`, replacing
   placeholders with the intended Firebase web-app configuration. Vite embeds all
   VITE values in the public bundle: never use Admin keys, service-account JSON or
   secrets. Use separate disposable and production Firebase projects.
2. Confirm Auth providers and authorized domains in the selected Firebase project.
   Verify owner-only Firestore read/write/delete rules with two disposable users,
   including notes updates and denial of cross-user access. No rules are changed by
   this repository's Hosting configuration. Do not enable public read/write rules.
3. Leave Live API URL empty for disconnected mode, or supply the approved HTTPS
   API base URL. Hosting has no API proxy; `/api` works only behind a separately
   configured same-origin reverse proxy. Follow LIVE_MODE.md for verified tokens,
   explicit UID allowlists, exact CORS origins and read-only telemetry mounts.
   Never expose Flask's development server or enable privileged collection publicly.
4. Build with the intended environment and rerun checks. Inspect the generated
   assets for unintended data. Keep service-account credentials outside the repo
   and frontend/public. Do not run `firebase init` over the checked-in config.
5. After explicit release approval, use an installed official Firebase CLI and
   explicitly choose the project (there is deliberately no default project alias):

   ```sh
   firebase deploy --only hosting --project YOUR_APPROVED_PROJECT_ID
   ```

6. Verify HTTPS, direct navigation/reload of `/login`, `/reset-password`, `/demo`
   and protected deep links; sign-in/sign-out, scenario switching, owner data,
   and graceful offline/live denial. Check lazy route loading after a deployment.
   Validate headers and that no credentials/private telemetry are publicly served.
   Keep the prior Hosting release available for console rollback if smoke checks fail.

## Remaining release gates

- Real Firebase Auth delivery/popups/persistence and deployed Firestore permission
  tests require a disposable configured project; mocks are not integration proof.
- Account deletion only checks the known schema and is not atomic with writes.
  Trusted deletion workflow/write blocking and reconciliation remain necessary
  before promising complete cleanup; see ACCOUNT_SETTINGS.md.
- Browser PDF pagination/output still needs manual verification.
- Production Live ingress and telemetry isolation, real-device accessibility,
  screen-reader/reduced-motion behavior and post-deploy smoke checks remain open.
- No public deployment, production rule change or network fault injection occurred.

## Selected submission architecture: Vercel + Render Free + existing lab VM

This supersedes the earlier Firebase Hosting recommendation for this submission.
Vercel project root: `frontend`; framework: Vite; build: `npm run build`; output:
`dist`. `frontend/vercel.json` supplies SPA deep-link rewrites. Add the public
VITE Firebase configuration and `VITE_LIVE_API_BASE_URL=https://SERVICE.onrender.com/api`.
Add the resulting Vercel domain to Firebase Auth authorized domains.

Render Web Service: repository root; Python; build `pip install -r requirements.txt`;
start `gunicorn --workers 2 --bind 0.0.0.0:$PORT app.api.main:app`; health path
`/api/health`; Free instance. No paid disk. Set:

- NETSCOPE_TELEMETRY_STORAGE=firestore
- NETSCOPE_FIREBASE_PROJECT_ID=netscope-fa309
- NETSCOPE_ALLOWED_ORIGINS=https://YOUR-APP.vercel.app
- NETSCOPE_LIVE_UIDS=approved Firebase user UID(s)
- NETSCOPE_ENABLE_ADMIN_REFRESH=false
- NETSCOPE_INGEST_TOKEN=a generated random server secret, at least 32 characters
- GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json

Provide the matching Firebase Admin JSON as a Render secret file named
`firebase-admin.json`, never as a frontend environment variable or repository file.
Before uploading telemetry, verify Firestore client rules deny all browser access
(read and write) to `_netscope_private/**`, including overlapping wildcard grants.
The Admin SDK accesses it through IAM. Do not overwrite existing owner rules.

On the VM, use the existing collector plus `app/collector/upload.py`. A hardened
systemd unit, setup steps and verification guidance are in
`docs/LIVE_TELEMETRY_SERVICE.md`. Set
NETSCOPE_UPLOAD_URL=https://SERVICE.onrender.com/api/telemetry/ingest and the same
NETSCOPE_INGEST_TOKEN in a protected environment file, then run
`python3 -m app.collector.upload` under a service supervisor. No Firebase Admin
credential is needed on the VM. It uploads once per collection + 60 seconds,
without writing local snapshots. Upload redirects are refused; failures retry.
The server requires the upload secret, rejects browser Origin requests, bounds
payloads, validates timestamp/router fields and stores only allowed BGP fields.
One latest binary snapshot replaces the previous Firestore document; no history
accumulates. Cloud incident history is explicitly marked unavailable.

At one upload/minute this uses roughly 1,440 writes/day, shared with the project's
other activity. Monitor free quotas; no billing upgrade is authorized. Free Render
may take about a minute to wake after idle; retry Live after it is awake. Do not
promise uninterrupted availability. Real telemetry uploads during judging keep
observations current; this is not a synthetic keep-alive task.

Sources: https://render.com/docs/free and
https://firebase.google.com/docs/firestore/quotas and
https://vercel.com/docs/frameworks/frontend/vite
