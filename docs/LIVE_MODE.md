# Secure Live Mode — Phase C

The protected `/dashboard/live` workspace reads stored observations through
`GET /api/live/snapshot`. It never runs collection, injects faults, writes incident
history, or saves reports automatically. The authenticated operator uploader stores
each snapshot and updates its incident lifecycle on the backend. Demo fixtures remain
independent.

## Configuration

Install backend dependencies with `python -m pip install -r requirements.txt` in
an isolated environment. Export the following in the backend service environment
(the application does not automatically load a .env file):

| Variable | Meaning |
| --- | --- |
| `NETSCOPE_FIREBASE_PROJECT_ID` | Expected Firebase project, matching frontend Auth |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional path to server-only ADC credentials; use managed ADC where available |
| `NETSCOPE_LIVE_UIDS` | Comma-separated Firebase UIDs authorized to view this network; empty denies everyone |
| `NETSCOPE_ALLOWED_ORIGINS` | Exact frontend origins, including scheme and port; no wildcard |
| `NETSCOPE_TELEMETRY_DIR` | Absolute operator-owned directory with `telemetry_*.json` and optional `incident_history.json` |
| `NETSCOPE_ENABLE_ADMIN_REFRESH` | Leave unset/false; privileged collection disabled by default |
| `NETSCOPE_ADMIN_UIDS` | Additional admin allowlist if explicitly enabling local administration |

Set frontend `VITE_LIVE_API_BASE_URL` to `/api` for a same-origin reverse proxy,
or an absolute HTTPS API base such as `https://api.example.test/api`. Only loopback
hosts permit HTTP. An empty value displays Not configured. Rebuild after changing
Vite environment configuration. Never put Admin credentials in VITE variables.

The server verifies Firebase ID tokens with revocation checks, then requires a
network UID allowlist match. Authentication service/configuration failures deny
access. Emulator authentication is explicitly rejected. CORS is an additional
browser restriction, not authorization. Verification follows Firebase's
[ID-token documentation](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
and [session revocation guidance](https://firebase.google.com/docs/auth/admin/manage-sessions).

## Deployment boundary

No deployment or tunnel was provisioned in Phase C. Run behind a production WSGI
server bound to loopback and an HTTPS reverse proxy or authenticated tunnel.
Expose only GET/OPTIONS `/api/live/snapshot` and optionally `/api/health`; deny
other paths/methods at ingress. Preserve Authorization and Origin headers, disable
response caching, and redact Authorization from logs. Add ingress rate limits.
Keep the API filesystem access read-only and Docker access outside its process
where possible; collect telemetry separately through the operator workflow.
The development entry point now binds to 127.0.0.1 rather than all interfaces.

Legacy telemetry/diagnosis/incidents endpoints now require authorization, which
is a deliberate compatibility change for existing callers. Administrative refresh
additionally requires explicit enablement and an admin UID, and rejects every
request carrying Origin. Do not expose this route through public ingress.

## Data semantics and failures

In local-directory mode, the newest lexically named telemetry file is read, with a
2 MB limit per file. The existing collector's timestamp filenames satisfy this
ordering. In Firestore mode, the latest bounded snapshot and incident history share
one private server-only document. Each accepted upload updates incident state from
its diagnosis; incomplete router collection leaves active incidents unchanged, and
a complete snapshot without a candidate resolves them. The last 50 records are
returned; timestamps describe observation time and may differ from API response time.

Responses distinguish observation time from API response time. Older than three
minutes is stale; unknown/future timestamps do not imply fresh data. Router
collection success and BGP hypotheses are separate from physical link state,
which remains unmeasured. Reachable API does not mean healthy/running lab.

Manual refresh reads storage only. Optional polling runs every 30 seconds while
visible, with no overlapping requests, a ten-second client timeout, and cleanup
on unmount. Access denial clears the snapshot and stops polling. Other failures
retain the last successful snapshot with a visible warning. Session changes
prevent old responses from populating another user's workspace. Tokens and
telemetry are not persisted by this page; redirects and fetch cookies are disabled.

## Verification boundary

Automated authorization tests mock Firebase verification; UI tests use isolated
synthetic fixtures. Real project credentials, live token verification, VM reachability,
HTTPS ingress and deployed access policy still require an operator integration check.
No production auth settings, VM state, Docker state or Firestore data were changed.


## Investigation workflow (Phase D)

`/dashboard/investigate` offers an explicit one-shot diagnosis of the latest stored
Live snapshot, or review of a prerecorded demo scenario. It captures a fixed result,
correlates router/link evidence and presents unexecuted verification suggestions.
The separate Live monitoring page still does not save automatically. An explicit
Save in the investigation workflow copies the full captured observations into the
signed-in user's investigation history with Live provenance and timestamps. This
uses existing Firestore owner permissions; deployed rules were not changed or verified.
