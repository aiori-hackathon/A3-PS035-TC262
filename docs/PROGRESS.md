# NETSCOPE progress — 31 October 2026

## Live telemetry ingest compatibility fix

### Completed
- Corrected active probe observations to report the target router ID rather than
  the topology endpoint key (`a` or `b`). The backend validates router IDs and
  endpoint addresses before storing telemetry, so the previous payload was
  rejected despite successful collection and authentication.
- Added an ingest regression test that builds probe measurements from the lab
  topology and verifies the backend accepts the resulting snapshot.

### Verification
- Targeted telemetry-ingest tests: PASS, 7 tests.
- Diagnosis and telemetry-ingest tests: PASS, 9 tests.
- Python compile check and `git diff --check`: PASS.
- Full unittest discovery remains incomplete because the local Python environment
  does not have `firebase_admin` installed (`tests/test_live_api.py` import error).
- VM-side snapshot validation previously failed with
  `Probe does not match configured link endpoints`; rerun after deploying this fix.

## Current milestone
My Investigations, Phase A and Phase B are committed and pushed. Phase B is
`8d1bb28` on origin/main. Phase C was committed and pushed as `bae01be`.
Phase D (`b234853`) and Phase E (`fa39780`) are committed and pushed to origin/main.
Phase F account settings are verified and approved for commit/push on 31 October 2026.
PDF output verification and production account cleanup guarantees remain open.
Existing work was preserved throughout. No production records were deleted and no
deployment was performed. See the Git milestones below for approved commits.

## Architecture audit
- Existing React/Vite frontend: public landing/demo, Firebase Auth session provider,
  protected workspace, per-user Firestore snapshots and detailed reports.
- Four demo fixtures retained unchanged. Healthy fixture omits evidence; the save
  service now treats absent evidence as an empty list.
- Snapshot JSON remains backward compatible; metadata-only records are visible.
- Flask exposes health, telemetry, diagnosis, incidents and privileged refresh.
  Original audit: refresh calls Docker telemetry collection and lacked token verification.
  Phase C adds authentication and disables administrative refresh by default.
  Incident GET reads history; collection/refresh is the path that updates history.
- No checked-in Firestore rules found. Deployed owner rules are not verified.
- Baseline build passed with a large bundle warning; baseline lint had seven errors.

## Completed
- History batches of 25, cursor pagination, ten visible matches at a time.
- Explicit search/filter/sort scope: all loaded records, not merely visible cards.
  Load more to extend the scope; entire archive is stated only after exhaustion.
- Document-ID pagination includes legacy documents missing createdAt. Newest/oldest
  sorting is over loaded records; batches are NOT globally newest-first.
- Search title, scenario ID/name, source and available fault classifications.
- Source/scenario/status/date filters; newest/oldest/title sorting.
- Metadata, counts, unknown values, simulated provenance and report links.
- Owner-scoped deletion, named confirmation, Escape/cancel, repeated-submit guard,
  success feedback, failure retention and removal from the local loaded list.
- Navigation from workspace, details, and successful save.
- Responsive styles and reduced-motion/focus treatment.
- Existing lint failures corrected: unused imports, auth hook separated from provider,
  redundant synchronous state updates removed from protected pages.

## Resume verification and fixes
- Process inspection: no fixture/test process running after interruption. Two existing
  Vite servers were left untouched. The separate fixture server used loopback port 5180.
- Fixed fixture server missing Vite React preamble via transformIndexHtml.
- Fixed deletion focus restoration: move focus after dialog closes, to Saved reports.
- Removed trailing blank line identified by git diff --check.

## Exact check results
- `npm --prefix frontend run lint`: PASS, exit 0, no errors/warnings.
- `npm --prefix frontend test`: PASS, 9 tests, 0 failed/skipped. Node 22.16.0 emits
  an experimental-module-mocking notice; no test dependency added.
- `npm --prefix frontend run build`: PASS, exit 0, 1969 modules. JS 920.43 kB
  (277.72 kB gzip), CSS 59.22 kB. Existing >500 kB chunk warning remains.
- `python3 -m unittest discover -s tests`: PASS, 2 tests.
- `git diff --check`: initially found AuthContext trailing blank line; corrected;
  final check PASS.
- Browser checks against isolated in-memory fixtures: PASS for initial loading,
  25-to-31 record pagination, 10-to-20 visible results, search across loaded batches,
  source/scenario filters, oldest/title sorting, clear filters, legacy metadata,
  unknown counts/date, empty archive, load failure/retry, deletion confirmation,
  Escape cancellation, successful deletion, failure retention, disabled repeat submit,
  focus restored to Saved reports, date range filtering and invalid-range alert.
- Viewport checks: 320, 390, 768 and 1280 px iframe viewports, no horizontal document
  overflow. At scrollbars: content/client widths were 375/375, 753/753, 1265/1265;
  320 narrow viewport measured 320/320. Mobile layout visually inspected.
- Date test automation initially filled native fields without React updates; native
  ArrowUp changes exercised the real handler and confirmed filtering/validation.
- UI fixture loads no Firebase module or real account. Real sign-in, deployed Firestore
  permissions, cross-user security enforcement and real backend remain UNVERIFIED.

## Reproduce
From repository root:

```sh
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
python3 -m unittest discover -s tests
node frontend/tests/ui-preview.mjs
```

Fixture URLs: `http://127.0.0.1:5180/`, `/?empty`, `/?load-error`, `/?delete-error`.
Viewport harness: `/tests/viewport.html?width=390` (also 320, 768, 1280).
These files are outside the production entry point and are not copied by Vite build.

## Remaining limitations and next step
- History uses on-demand reads, not a live listener. Changes in other tabs require
  revisiting/reloading. Local deletion updates immediately after server success.
- Search/sort become archive-wide only after all batches are loaded; no backend
  full-text index is present. Full snapshots are downloaded with each batch.
- Dashboard now uses a five-document listener and aggregate counts; see Phase A below.
- Rules must be checked/tested in an authorized Firebase emulator/project before
  claiming deployed owner isolation. Frontend path checks are not a security boundary.
- Next: demo refinements and secure read-only Live
  Mode; route splitting to address the bundle warning. No live API/public deployment
  before authentication/authorization and privileged-route isolation are implemented.


## Phase A — Dashboard navigation and operational polish

### Implemented
- Responsive sidebar/navigation with Overview, My Investigations, Demo lab and Live
  connection status; visible navigation on mobile and a keyboard skip link.
- Quick actions for the public demo, saved investigations and live availability.
- Five newest dated investigations in a cleaned-up report list, with View All.
  Undated legacy reports remain accessible in the archive and are counted in totals.
- Firestore aggregate queries for total/Demo/Live counts. No history-wide document
  download. Source-less records are included in total, not invented as Live records.
- Counts are server reads on entry/Refresh workspace, with the check time displayed.
  They are not advertised as a continuously synchronized transactional snapshot.
- Recent reports retain a bounded real-time listener and show cached-data provenance.
- Independent count/list errors, refresh/retry, skeletons, empty/legacy onboarding.
- Account provider and email-verification information, broken-photo initials fallback,
  logout progress/repeat-submit guard and error recovery.
- Live action goes to the actual disconnected status panel, not an unimplemented
  route. Backend availability is explicitly not checked, no telemetry is fabricated,
  and no privileged Flask endpoint is called.

### Files for this phase
- Created: `frontend/src/services/dashboard.js`, `frontend/src/styles/Dashboard.css`,
  `frontend/tests/dashboard.test.mjs`.
- Updated: `frontend/src/pages/UserDashboard.jsx`, fixture server/viewport harness,
  and this progress document. Existing investigations changes remain intact.

### Verification on 26 October 2026
- Lint: PASS, exit 0, no errors/warnings.
- Frontend tests: PASS, 13 total (9 existing + 4 dashboard service tests), 0 failures.
  New coverage: aggregate owner paths and all-record totals, five-document listener,
  cache metadata, cleanup, permission failures and session-switch protection.
- Build: PASS, 1971 modules, JS 927.06 kB (279.46 kB gzip), CSS 66.05 kB.
  Existing >500 kB bundle warning remains; not suppressed.
- Python tests: PASS, 2 tests. `git diff --check`: PASS.
- Synthetic browser checks: populated metrics/five reports, broken image fallback,
  new-user onboarding, legacy-only archive messaging, count failure/retry, recent-list
  failure with working counts, cached empty data, logout failure and success routing
  to `/login`, Live status anchor. All PASS.
- Viewports: 320/390/768/1280 px checked; content width matched client width with no
  horizontal document overflow. Mobile and desktop layouts visually inspected.
- Production sign-in, Firestore aggregate permissions and deployed security rules
  remain unverified; UI checks use fixtures with no production data access.
- Test fixture server stopped after checks; other development servers untouched.

### Git milestones
- User explicitly approved separate feature commits and push to `origin/main`.
- `b5a34ba`: feat: add saved investigation management.
- `d77a420`: feat: polish dashboard navigation and operational summaries.
- Push succeeded: `14e3ea9..d77a420 main -> main`; local origin/main also resolves
  to d77a42045ce181e4edac9714e2f783b65134b2de. No force push or history rewriting.
- Phase B was subsequently approved, committed as `8d1bb28`, and pushed to origin/main.

## Phase B — Demo enhancements

### Completed
- Added independent static scenario loader and request-keyed hook. Changes and reloads
  invalidate old data during render, before effects; aborted responses cannot replace
  the selected snapshot. Failed/loading requests cannot show false healthy results.
- Reset to healthy and reload controls clear selection; provenance explains that reload
  reads a prerecorded fixture, not fresh diagnosis/telemetry. Missing timestamps stay
  unavailable. All four JSON fixtures and schemas are unchanged.
- Router nodes and links support keyboard and pointer inspection. Wider SVG hit targets,
  selected-state cues, focus on inspection, focus return on close, and corrected node/link
  geometry improve usability. Mobile status labels remain visible, not color-only.
- Router context exposes recorded collection status, findings, adjacent links and cited
  peer evidence. Link context distinguishes recorded physical/BGP state; absent details
  are not inferred as facts.
- Selected evidence is highlighted in the full timeline using direct associations and
  explicit evidence IDs. Multiple faults keep their evidence/hypotheses separate.
- Findings distinguish physical observations, routing observations, and possible downstream
  BGP symptoms where a physical-link hypothesis exists. No invented confidence scores.
- Subtle selection/hover transitions and reduced-motion support; no invented traffic.
- Save uses the exact clicked snapshot, guards repeated submissions, handles permission
  failures, and links directly to the saved report. Old completion feedback is discarded
  after scenario/session changes. Public users are directed to login before saving.

### Files
Created: `frontend/src/services/demoScenarios.js`, `frontend/src/hooks/useDemoScenario.js`,
`frontend/src/styles/DemoEnhancements.css`, `frontend/tests/demo.test.mjs`.
Modified: DemoDashboard, SaveInvestigation, isolated fixture/viewport harness, this log.

### Final checks
- `npm --prefix frontend run lint`: PASS, exit 0, no errors/warnings.
- `npm --prefix frontend test`: PASS, 19 tests, 0 failed/skipped (six new demo tests).
  Node experimental module-mocking notice remains.
- `npm --prefix frontend run build`: PASS, 1974 modules. JS 931.90 kB (280.82 kB gzip),
  CSS 68.89 kB. Existing >500 kB bundle warning remains and is not suppressed.
- `python3 -m unittest discover -s tests`: PASS, 2 tests.
- `git diff --check`: PASS.
- Browser fixtures: all four scenarios rendered; rapid switching, delayed reload hiding
  old snapshots/disabled Save, keyboard link/router inspection, map pointer hit targets,
  selected evidence counts, router peer evidence, close focus, reset, HTTP 503 failure,
  recovery, public demo/login navigation, permission-denied save/retry and saved report
  link all PASS. Multiple faults: physical link highlights five evidence records;
  routing context has six. Successful save during reset retained multiple_faults and
  eleven evidence records, one request; no stale saved badge on the new scenario.
- Responsive checks: 320/390/768/1280 px, no horizontal document overflow; mobile
  topology visually reviewed. R4/R5 spacing and link-to-node alignment corrected.
- UI save tests use an in-memory fixture service. Production Firebase writes, deployed
  rules and real authentication remain unverified. No VM/Docker/privileged API calls.
- Fixture server stopped after checks. Existing development servers left untouched.

### Remaining limitations / next step
- Existing login flow still lands on the dashboard; returning directly to a selected
  scenario after sign-in is a future authentication-flow refinement.
- Phase B does not add live telemetry. Secure Live Mode must first add server-side token
  verification/authorization and isolate privileged refresh from the public API.
- Approved commit `8d1bb28 feat: enhance demo inspection and snapshot safety`
  was pushed to origin/main; remote advanced from d77a420 to 8d1bb28.

## Phase C — Secure read-only Live Mode (27 October 2026)

### Completed and pushed as bae01be
- Added protected Live workspace and dashboard navigation, stored topology/router
  inspection, BGP observations, correlated causes/evidence, estimated impact and
  stored incident history. API reachability is separate from telemetry freshness.
- Added Firebase Admin ID-token verification with revocation checks, explicit
  project and UID authorization, exact-origin CORS, no-store headers and fail-closed
  authentication errors. Legacy data routes now require bearer authorization.
- Added read-only `/api/live/snapshot`, explicit telemetry storage configuration,
  bounded file reads and sanitized output. Tests assert no collection, save or
  incident update is called. Physical link state remains unmeasured.
- Administrative refresh disabled by default, requires additional admin authorization
  when enabled, and rejects browser Origin requests. Development server is loopback-only.
- Added HTTPS-only client configuration (loopback exception), token/response session
  guards, timeout/abort handling, disabled redirects/cookies and optional visible-page
  polling. Access denial clears data; connection loss retains a labeled last snapshot.
- Fixed unknown-time handling: the browser now preserves the backend's unknown
  freshness classification even when it can parse the timestamp locally.
- Added `requirements.txt`, backend/client tests and `docs/LIVE_MODE.md` with
  configuration, proposed ingress boundary and deployment/integration limitations.

### Final checks
- `npm --prefix frontend run lint`: PASS, exit 0, no lint diagnostics.
- `npm --prefix frontend test`: PASS, 27 tests, 0 failures/skipped; experimental
  Node module-mocking notice remains. Includes eight Live API client tests.
- `npm --prefix frontend run build`: PASS, 1977 modules; existing >500 kB JS
  chunk warning remains. No warning suppression added.
- `/private/tmp/netscope-live-venv/bin/python -m unittest discover -s tests`:
  PASS, 11 tests (nine new security/read-only API tests), no failures.
- `git diff --check`: PASS.
- Isolated browser fixtures: PASS for stale snapshot, router filtering, link-related
  evidence, denied access with polling disabled, unconfigured controls disabled,
  connection loss retaining labeled last-known data, and polling checkbox toggle.
- Responsive harness checked 320/390/768/1280 px frames with no horizontal content
  overflow reported; mobile and desktop screenshots reviewed. Browser fixture uses
  synthetic services, not actual Firebase tokens or VM data. Timed background polling
  and deployed end-to-end auth were not exercised in the browser.
- Fixture server stopped after checks. Existing changes preserved; Phase C was
  approved, committed and pushed as bae01be. No deployment, production writes, VM/Docker operations or fault injection.

### Approval / remaining activation
- User approved commit `feat: add authenticated read-only live monitoring`
  and push to origin/main on 27 October 2026.
- Real ADC credentials, Firebase token validation, authorized UID/origin configuration,
  HTTPS ingress and VM integration need operator verification before activation.
  No tunnel or public API exposure was provisioned.


## Phase D — Fault Investigation Workspace (27 October 2026)

### Completed
- Added protected `/dashboard/investigate`, linked from the dashboard sidebar and
  Live workspace. Source/scenario selection, explicit start, captured result,
  context inspection, investigative guidance and save form one workflow.
- Demo reviews unchanged prerecorded diagnoses. Live calls the existing authenticated
  read-only snapshot endpoint, which computes diagnosis from stored telemetry. No
  collection, active probes, commands or fault injection were added.
- Results are detached from loader updates. Source/scenario/session changes unmount
  the run, cancel pending reads and clear old results. Starting again removes the
  prior saveable snapshot. Observation, review-start and capture times remain distinct.
- Router/link context correlates findings, hypotheses and evidence, including backend
  peer observations. Multiple independent demo faults retain separate evidence sets.
  Full-result impact is labeled separately from filtered context. No confidence scores.
- Suggested investigative steps are explicitly unexecuted operator recommendations.
  Missing observations, incomplete collection and uncertainty remain visible.
- Extended existing save service for Live provenance and capture metadata, preserving
  old demo snapshots and JSON format. Saves require matching current UID and reject
  snapshots exceeding 800,000 UTF-8 bytes. Explicit Live save describes the copy into
  private Firestore history. No automatic writes.
- Report viewer retains capture provenance and supports backend incident field names;
  estimated Live impact is no longer labeled confirmed physical-link failure.
- Browser review fixed a shared 320px minimum-width overflow with classic scrollbars;
  html/body now shrink to the available viewport. Updated viewport harness reports
  body width as well as document width.

### Files
Created: `frontend/src/pages/FaultInvestigation.jsx`,
`frontend/src/services/faultInvestigation.js`,
`frontend/src/styles/FaultInvestigation.css`,
`frontend/tests/faultInvestigation.test.mjs`.
Modified: App routing, UserDashboard navigation, LiveMonitoring navigation,
InvestigationDetails, investigations save service, index.css, investigation tests,
isolated UI/viewport harness and progress documentation.

### Verification
- Frontend lint: PASS, no diagnostics.
- Frontend tests: PASS, 34 tests, 0 failed/skipped (seven new Phase D tests).
  Covers all four demo results, snapshot detachment, independent fault evidence,
  Live normalization, cancellation/session changes, errors, uncertainty guidance,
  Live save provenance and payload limits. Existing module-mocking notice remains.
- Production build: PASS; existing >500 kB bundle warning remains.
- Backend unittest suite: PASS, 11 tests; backend implementation unchanged in Phase D.
- `git diff --check`: PASS.
- Browser fixture: multiple-fault result shows five findings/two causes/eleven evidence
  records; R2-R4 selection shows three findings/one cause/five evidence records.
  Saving this filtered view preserved all eleven evidence records, one request,
  and displayed the saved report link. Source switching cleared the previous result.
- Browser fixture: Live stored-snapshot result, physical-state uncertainty, stale
  label and operator guidance render; permission-denied save remains retryable;
  offline Live returns error with no result/save action. Healthy snapshot correctly
  shows absent observation time and no-evidence caveats.
- Responsive checks at 320/390/768/1280px frame widths report no document/body overflow.
  Populated 320px workflow and desktop layout visually reviewed.

### Boundaries / next action
- All UI/service tests use synthetic or mocked services. No production Firestore
  writes or auth configuration changes. Deployed owner rules and real Firebase/VM
  integration remain unverified, as documented in LIVE_MODE.md.
- Phase D committed as `b234853` after user approval on 31 October 2026:
  `feat: add evidence-based fault investigation workspace` and push to origin/main.
- Next development phase after approval: Phase E Reports and Export.


## Phase E — Reports and Export (31 October 2026)

### Implemented
- Report tools on saved investigation details: metadata-only by default, explicit
  section selection for findings/hypotheses, evidence, incidents, impact and saved
  operator notes. Prepare a visible preview before downloading JSON or printing.
- JSON uses a versioned report format with source, observation/capture/save/export
  times and uncertainty disclaimer. Export is a selected report, not a full backup.
  An allowlist excludes arbitrary fields, raw telemetry, credentials and config.
  Selected free-text may still contain sensitive content; review before sharing.
- Print stylesheet prints only the prepared preview. Print / Save as PDF invokes
  the browser dialog; no external export service or new PDF dependency. The user
  chooses Save as PDF. Actual PDF pagination/output has NOT yet been verified.
- Notes use owner-scoped updateDoc and modify only notes/notesUpdatedAt, with a
  10,000-character limit, duplicate-submit guard and retained draft on failure.
  Exports include saved notes only. Writes replace notes (last write wins); no
  collaborative editing or conflict merging. Original evidence is unchanged.
- Details are keyed by account/report to clear the old result immediately during
  session/navigation changes; document ID comes from Firestore rather than payload.
- Existing legacy metadata reports and malformed JSON can still export metadata.
  No migrations, production writes, Firebase rule changes or deployment performed.

### Files
Added `frontend/src/components/ReportTools.jsx`, `frontend/src/styles/ReportTools.css`,
`frontend/src/utils/reportExport.js`, `frontend/src/services/reportNotes.js` and
`frontend/tests/reportExport.test.mjs`. Updated InvestigationDetails and the isolated
UI/viewport harness, retaining every existing Phase D change.

### Verification
- `npm --prefix frontend run lint`: PASS, no diagnostics.
- `npm --prefix frontend test`: PASS, 41 tests, 0 failures/skipped. Seven new tests
  cover opt-in fields, credential-field exclusion, legacy/corrupt snapshots, Live
  provenance, filenames and owner-scoped/validated notes writes. Node experimental
  module-mocking warning remains.
- `npm --prefix frontend run build`: PASS, 1984 modules; JS 964.23 kB (289.31 kB gzip),
  CSS 73.16 kB. Existing >500 kB bundle warning remains.
- Backend tests initially could not run because the prior temporary virtualenv had
  expired and system Python lacked firebase_admin. Recreated the temporary venv and
  installed existing requirements; final unittest run: PASS, 11 tests.
- `git diff --check`: PASS.
- Browser synthetic fixture: saved notes success; permission denial preserves draft;
  selected metadata/notes preview; full selected report with 5 findings, 2 hypotheses,
  11 evidence records and 2 incidents; JSON download action feedback all verified.
  JSON payload content verified in unit tests; downloaded file not inspected in UI.
- Responsive fixture: 320/390/768/1280px frames, no horizontal document/body overflow.
- Print click blocked embedded-browser control; the app containing its dialog is
  unavailable to computer-use tools. Closed the temporary tab. PDF output/pagination
  remains a manual browser verification item; do not claim verified PDF delivery.
- Fixture server stopped after checks. Optional comparison is deferred.

### Approval / next step
- User approved both commits and push on 31 October 2026. Phase D is `b234853`.
- Approved Phase E commit message:
  `feat: add reviewed report exports and operator notes`.
- Complete a browser Save as PDF check before release. Real Firestore rule permission
  for notes updates and real Live/Firebase integration remain unverified.
- Next implementation phase: Phase F Account and Workspace Settings.


## Phase F — Account and Workspace Settings (31 October 2026)

### Completed locally
- Protected account settings with display-name editing, current photo removal,
  initials fallback and authenticated profile refresh across the workspace.
- Provider-aware controls: Google-only accounts do not expose password change;
  email/password changes reauthenticate before mutation. Linked providers supported.
- Email verification request/status refresh; public reset page with generic delivery
  feedback and login link. Passwords cleared from settings state after operations.
- Typed DELETE confirmation, focus management, same-identity reauthentication and
  server-only empty-workspace checks before Auth deletion. Existing records never
  bulk-deleted. Remaining reports/profile data, offline reads and permission errors
  block deletion. No real account operations were executed during development.
- Session guards before/after asynchronous identity verification, duplicate-operation
  guard, mapped provider errors and safe feedback. Current user/profile context refresh.
- Added `docs/ACCOUNT_SETTINGS.md` with cleanup strategy and release limitations.

### Files
Created AccountSettings.jsx, ResetPassword.jsx, services/account.js,
styles/AccountSettings.css and tests/account.test.mjs. Updated App routes,
AuthContext, Login reset link, UserDashboard navigation and isolated UI harness.

### Checks
- `npm --prefix frontend run lint`: PASS, no diagnostics.
- `npm --prefix frontend test`: PASS, 51 tests, 0 failed/skipped; ten new account tests.
  Includes provider handling, owner/name validation, password checks/reauthentication,
  account-switch race, empty/nonempty account deletion, offline failure and safe errors.
- `npm --prefix frontend run build`: PASS, 1988 modules; JS 978.78 kB (292.96 kB gzip),
  CSS 74.08 kB. Existing >500 kB bundle warning remains.
- Python unittest discovery in temporary venv: PASS, 11 tests. Backend unchanged.
- `git diff --check`: PASS.
- Synthetic browser UI: Google-only password guidance, profile update, verification
  request and status refresh, typed deletion confirmation, remaining-data block,
  cancel focus restoration, password mismatch/success feedback and generic public
  reset feedback all PASS. No real emails, credentials or deletion used.
- Responsive 320/390/768/1280px frames show no horizontal document/body overflow;
  desktop settings screenshot reviewed. Fixture server stopped after checks.

### Limitations and next step
- Empty-account deletion is guarded for the current schema, not an atomic cleanup
  guarantee: concurrent writes or unknown subcollections require trusted server
  cleanup and deployed write-blocking rules. Production cleanup remains open.
- Real Firebase email delivery, recent-login enforcement, Google popups, project
  password policy and deployed owner rules need disposable-project integration tests.
- User approved `feat: add provider-aware account settings and recovery`
  and push to origin/main on 31 October 2026.
- Next roadmap phase: Phase G UI/UX polish. Phase E PDF verification remains open.

## Phases G, H, I and J — combined delivery (31 October 2026)

Status: implemented locally, awaiting approval for one combined commit and push.
Phase F was committed and pushed as `bf27cfb` before this work.

### G — UI and accessibility polish
- Shared visible keyboard focus, reduced-motion CSS, improved auth contrast and
  underlined links; mobile input sizing and persistent signup password guidance.
- Announced session/loading states and busy auth forms; accessible route loading
  and recovery view with reload/home actions.
- Synthetic Login/Signup fixture added. Both pages verified at 320, 390, 768 and
  1280px: document/body widths match their available frame widths, no overflow.
- Synthetic invalid login displays mapped error; keyboard focus outline visible.
  No real sign-in, mail or account mutation was performed. Reduced-motion CSS was
  reviewed; OS preference and screen-reader behavior have not been tested.

### H — performance
- Lazy imports for every route; Auth initialization separated from Firestore so
  database code loads with routes that need it. Existing service facade preserved.
- Production entry JS reduced from 978.78 kB (292.96 gzip) to 374.56 kB
  (116.81 gzip), about 62% smaller. Deferred Firebase chunk 468.82 kB; page chunks
  1.52–26.56 kB. Entry CSS 3.92 kB. No oversized-chunk warning or threshold change.
- These are build artifact sizes, not measured network latency/Lighthouse scores.

### I — regression coverage
- Eight new regression cases cover account changes during deletion preflight,
  failed reauthentication, UTF-8 save limits, detached saved snapshots, session
  changes during response reads, cancellation, malformed responses and missing auth.
- Frontend tests: PASS, 59 tests, 0 failures/cancelled/skipped (exit 0).
- Backend tests: PASS, 11 tests (exit 0), temporary isolated Python environment.
- Frontend lint: PASS (exit 0), rerun after fixture additions.
- Production build: PASS (exit 0), 1990 modules; no chunk warning.
- `git diff --check`: PASS (exit 0).

### J — deployment preparation
- Added root Firebase Hosting configuration with SPA fallback and conservative
  cache/security headers, ignored CLI state, public environment template, and
  GitHub Actions frontend/backend checks. CI does not deploy or use credentials.
- Added DEPLOYMENT.md covering explicit project selection, HTTPS/authorized domains,
  separate environments, API ingress, release smoke checks and rollback.
- Configuration is prepared only: Firebase CLI hosting validation and remote CI
  execution have not run. No public deployment or production rule change occurred.
- Remaining release gates: real Firebase/Auth/rules integration, trusted atomic
  account cleanup, browser PDF output, real-device accessibility, production Live
  ingress and post-deploy verification. See DEPLOYMENT.md and ACCOUNT_SETTINGS.md.
- Local synthetic fixture stopped after verification. All changes remain uncommitted.

## Submission deployment connection — in progress
- User selected Vercel frontend, Render Free backend, existing Ubuntu lab VM and
  existing Firestore storage; no paid service authorized.
- SSH key connection verified. All five router containers running. VM has only
  about 78 MB free; no cleanup, package installation or reset performed.
- Added authenticated bounded telemetry ingestion, Firestore latest-snapshot read,
  disk-free stdlib VM uploader, Gunicorn dependency and Vercel SPA configuration.
- Backend tests: PASS, 17 tests including six ingestion/storage/auth checks.
  Git whitespace check PASS. Real cloud ingestion is not yet verified.
- Deployment still pending account access, Admin secret provisioning, private
  telemetry Firestore rule verification, approved UID/CORS configuration and
  commit/push approval. No cloud resources or VM uploader started yet.

## Phase K — PS-035 evidence pipeline and lab workflow (15 November 2026)

### Implemented locally
- Added `lab/topology.json` as the shared five-router/five-link inventory used by
  collection, diagnosis, impact estimation and the authenticated Live response.
- Collector now records interface state, bounded bidirectional ICMP probes and
  summarized recent container log events alongside BGP and address observations.
  The hosted read-only endpoint continues to consume stored snapshots only.
- Rule-based diagnosis combines interface state, packet loss/latency, BGP state and
  matching log events into ranked link hypotheses with transparent weighted scores,
  confidence labels and supporting signals. These scores are not probabilities.
- Live and investigation screens show source, collection coverage, hypothesis rank,
  confidence and evidence. They explicitly distinguish ICMP reachability from
  physical-link verification and preserve an unsupported-conclusion state.
- Live and investigation screens now display each link's probe direction, reply
  count, measured loss and average RTT, plus parsed log events when present.
- Log correlation excludes BGP Established/recovery events and caps repeated copies
  of the same router/peer/interface state so log repetition alone cannot inflate a
  candidate score.
- Added five labeled isolated-lab fault scenarios and a fixed-command CLI. Scenario
  listing is read-only; applying/restoring requires explicit `--confirm-lab ps035`
  and checks that all five configured lab containers are running. No scenario was
  applied in this work. Do not use on venue or production routers.
- Added a held-out JSONL evaluator for Top-1/Top-3 fault ranking, unsupported
  conclusion rate, abstention accuracy and fault-case abstention. No held-out
  dataset was supplied, so no model accuracy is claimed.
- Added a runbook for safe baseline → one fault → collect → restore → recovery
  verification and controlled held-out labeling. Added a read-only Containerlab
  preflight command and a one-shot collector output-directory option so run files
  can stay in protected temporary storage instead of the Git checkout.
- Increased the bounded ping sample to ten packets per direction to make the
  delay/loss scenario more informative; collection may take longer on timeouts.
- Ping output with a nonzero command exit but a packet summary is still counted as
  measured loss; a timeout with no summary remains unavailable.
- Tightened Firestore snapshot validation to require probes and summarized log
  events to match the configured topology and to constrain measurement values.
  Older snapshots can omit the new signals; those are treated as unavailable rather
  than healthy.

### Verification and remaining work
- `npm --prefix frontend run lint`: PASS, exit 0.
- `npm --prefix frontend test`: PASS, 59 tests, 0 failures/skipped. Node emits its
  existing experimental module-mocking warning.
- `npm --prefix frontend run build`: PASS, exit 0; 1990 modules. Deferred Firebase
  chunk is 468.82 kB (141.09 kB gzip); entry is 374.56 kB (116.81 kB gzip). No
  oversized-chunk warning.
- `python3 -m compileall -q app tools`: PASS, exit 0.
- `git diff --check`: PASS, exit 0.
- `python3 -m unittest tests.test_diagnosis`: PASS, 2 tests.
- `python3 -m unittest discover -s tests`: BLOCKED at two test-module imports because
  system Python has no `flask` or `firebase_admin`; the two diagnosis tests pass
  separately. No requirements were installed into system Python.
- `python3 -m app.collector.fault_lab list`: PASS, lists five scenarios and states
  that no network changes were made.
- Lab runbook is at `docs/FAULT_LAB_RUNBOOK.md`. The read-only `check` command and
  snapshot collection were not run because this checkout is not operating on the
  Ubuntu VM's Docker context; no VM/container state was touched.
- The user reconnected VS Code to `SSH: Ubuntu-VM`; the remote `/home/ayush/ps035`
  checkout is 15 commits behind `origin/main` and shows 29 pending changes. It was
  left untouched. A fresh remote terminal was opened, but disk and container output
  could not be read reliably through the UI, so current VM health remains unknown.
  Direct SSH from the local command environment timed out; no alternate Docker
  context was used.
- Extracted the shared command runner after startup-path review identified and
  removed a collector import cycle. `python3 -m app.collector.telemetry --help`
  now loads successfully without contacting Docker.
- Ping parser spot check: PASS for total packet loss and empty/unavailable output.
- Syslog correlation spot check: PASS; Established recovery was excluded and
  repeated matching fault lines did not inflate the candidate score.
- Held-out evaluation is pending; there is no labeled held-out dataset. No lab
  collection, fault injection, VM/Docker command, cloud write or deploy was
  performed during Phase K. Phase K was committed and pushed to origin/main as
  `b35d2b1`.
- Populate and independently review held-out runs before using evaluator metrics in
  a presentation. Validate actual FRR logs and probe behavior against the target
  Containerlab image before the regional demo.

## Phase L — Persistent VM telemetry service (16 November 2026)

### Implemented locally
- Added `deploy/systemd/netscope-telemetry.service` to run the existing uploader
  under the `ayush` account with Docker group access, restart-on-failure, a
  root-owned environment file, read-only host filesystem protections, and no
  Firebase credential on the VM.
- Added `docs/LIVE_TELEMETRY_SERVICE.md` with preflight, install, status/log,
  stop, backend-secret and Firestore quota guidance. It explicitly notes that the
  uploader sends bounded ICMP probes once per minute and requires an isolated lab.
- Linked the service guide from `docs/DEPLOYMENT.md`.

### Verification and boundaries
- `git diff --check`: PASS, exit 0.
- Unit-file verification could not run because `systemd-analyze` is not installed
  on the macOS development host. Installation and service start are not part of
  this change. The VM checkout remains a separate stale workspace with pending
  edits; it must be reviewed and safely updated before following the install guide.
- No VM state, router configuration, telemetry, cloud resource or Firestore data
  has been changed by Phase L.

## Phase M — Cloud live incident lifecycle (16 November 2026)

### Implemented locally
- Firestore telemetry ingestion now derives the diagnosis from each accepted
  snapshot and maintains bounded active/resolved incident history beside the latest
  snapshot in the same private server-only document.
- A continuing candidate updates its active incident; a complete healthy snapshot
  resolves incidents no longer supported by the evidence. Incomplete router
  collection preserves active incidents instead of falsely resolving them.
- The read-only Live snapshot API now returns the stored incident history, allowing
  the existing Live Monitoring incident panel to show real lifecycle records.
- Refactored local incident reconciliation into a reusable, side-effect-free helper
  and added regression coverage for opening, updating, resolving and incomplete
  snapshots. Updated the Live Mode guide.

### Verification and deployment status
- Incident reconciliation tests: PASS, 2 tests.
- Diagnosis tests: PASS, 2 tests.
- Frontend lint: PASS, exit 0.
- Frontend tests: PASS, 59 tests, 0 failures; Node's existing experimental module
  mocking warning remains.
- Frontend production build: PASS, exit 0; 1990 modules, no oversized-chunk warning.
- `python3 -m compileall -q app tests`: PASS; `git diff --check`: PASS.
- Telemetry-ingest integration test was added but could not run in this local Python
  environment because Flask is not installed (`ModuleNotFoundError: flask`). The
  backend integration result remains unverified until run in the backend environment.
- Phase M was committed and pushed as `700cd75` to `origin/main`. Render deployment
  state has not been verified yet. No Firestore writes were made by local checks.
- Live VM fault drill separately verified BGP fault detection and recovery against
  the current deployment; that operational result is recorded in the conversation,
  not treated as Phase M cloud incident-history verification.

## Phase N — Incident history triage and timeline (16 November 2026)

### Implemented locally
- Live Monitoring now filters the stored incident set to all, active or resolved
  records and shows first observed, last observed, resolution time and observed span.
- The API response keeps every active incident visible while filling the remaining
  50-record response capacity with the newest closed incidents.
- Added pure incident-history filter/span tests and bounded-history selection tests.
- Extended the isolated UI fixture with synthetic active/resolved incident records;
  visually checked the resolved filter and its lifecycle timeline.
- Refreshed the Live Monitoring MVP into an operations dashboard with a responsive
  router map, collection and incident summary cards, and focused connection status,
  using the same warm neutral and coral palette as the rest of the workspace.
- Replaced decorative signal animation with a quiet, selectable topology view and a
  direct link to prerecorded demo scenarios. Saved report cards now use severity
  accents, stronger reading hierarchy and a clearer recommended-action panel.

### Verification and status
- Frontend lint: PASS, exit 0.
- Frontend tests: PASS, 63 tests, 0 failures; existing Node experimental module
  mocking notice remains.
- Frontend production build: PASS, exit 0; 1991 modules, no oversized-chunk warning.
- Incident helper tests: PASS, 3 tests; diagnosis tests: PASS, 2 tests.
- `python3 -m compileall -q app tests`: PASS; `git diff --check`: PASS.
- Backend ingest integration test remains blocked in this local Python environment:
  Flask is missing (`ModuleNotFoundError: flask`).
- Local UI preview verified using synthetic data only. The preview server was stopped
  after inspection. Phase N was committed and pushed as `b496869` on 16 November 2026.
- The updated dashboard and synthetic router map were inspected in the isolated
  local preview; no production telemetry or router controls were used.
- Render deployment state for Phase M is still unverified; do not claim Phase N is
  deployed.

## Phase O — Bounded telemetry trends (16 November 2026)

### Implemented locally
- Each accepted Firestore upload adds one compact history sample to the same private
  latest document. The rolling window is capped at 120 samples (about two hours at
  the VM uploader's one-minute interval); it stores only timestamp, link ID,
  available probe count, average RTT and packet loss.
- Local-directory mode builds the same bounded view from the newest snapshot files.
- Live Monitoring renders per-link RTT and packet-loss trends and leaves unavailable
  measurements as gaps instead of treating them as zero.

### Verification and status
- Frontend lint: PASS, exit 0.
- Frontend tests: PASS, 63 tests, 0 failures; existing Node experimental module
  mocking notice remains.
- Production build: PASS, exit 0; 2564 modules, no oversized-chunk warning.
- Telemetry history helper: PASS, 3 tests. Incident tracker: PASS, 3 tests.
- Diagnosis tests: PASS, 2 tests. `python3 -m compileall -q app tests`: PASS;
  `git diff --check`: PASS.
- Synthetic browser preview showed both charts with a sample RTT series, a packet
  loss spike, a 10/120 window label, and readable axes. Preview server stopped.
- Telemetry-ingest integration tests are BLOCKED in the local Python 3.14 runtime:
  Flask and `firebase_admin` are not installed. Firestore persistence/API integration
  remains unverified here. No cloud writes or deployment were performed during local
  checks.
- Phase O was committed and pushed as `d55ae73` on 16 November 2026.

## Phase P — Direction-aware probe trends (16 November 2026)

### Implemented locally
- Historical samples now keep source and destination router for every adjacency
  probe, preserving asymmetric RTT and packet loss rather than averaging the two
  directions together.
- Unavailable directions are retained as explicit gaps. Older aggregate samples
  remain accepted and render as their original per-link series.
- Live trend legends identify direction (for example `R1 → R2`) so operators can
  compare the reverse path directly.

### Verification and status
- Frontend lint: PASS, exit 0. Frontend tests: PASS, 63 tests, 0 failures; Node's
  experimental module-mocking notice remains.
- Production build: PASS, exit 0; 2564 modules, no oversized-chunk warning.
- Telemetry history helper: PASS, 3 tests, including asymmetric loss and unavailable
  direction cases. Incident tracker: PASS, 3 tests; diagnosis tests: PASS, 2 tests.
- Python compilation and `git diff --check`: PASS.
- Synthetic browser preview showed separate `R1 → R2` and `R2 → R1` legend series
  and a one-direction loss spike. Preview server stopped after inspection.
- Flask/Firestore endpoint integration remains unverified because Flask and
  `firebase_admin` are missing from the local Python environment. No cloud writes or
  deployment were performed. Phase P was pushed to `origin/main` as `6b9f0d5`.

## Phase Q — Focused trend analysis (16 November 2026)

### Implemented locally
- Live Monitoring can focus trend charts on the newest 30 minutes, 60 minutes, or
  two hours of stored samples. Windows are anchored to the newest sample timestamp,
  so stale telemetry is not hidden by comparing it to the browser clock.
- Operators can filter to one topology link while retaining both directional probe
  series. Empty samples remain chart gaps.
- Summary metrics show average RTT, average packet loss, peak loss, and available
  probe readings versus directional observations for the selected range and link.
- Controls and metric cards adapt to narrow screens and retain keyboard focus styles.

### Verification and status
- Frontend lint: PASS, exit 0. Frontend tests: PASS, 66 tests, 0 failures; Node's
  experimental module-mocking notice remains.
- Production build: PASS, exit 0; 2565 modules transformed.
- Telemetry history helper: PASS, 3 tests; incident tracker: PASS, 3 tests;
  diagnosis tests: PASS, 2 tests.
- `python3 -m compileall -q app tests`: PASS; `git diff --check`: PASS.
- Phase P and Phase Q were committed separately as `6b9f0d5` and `8d5e2bd`, then
  pushed to `origin/main` with user approval. The project tree was clean after push.

## Phase R — Problem-statement completion: optional model and safe benchmark (16 November 2026)

### Implemented locally
- Added an opt-in standard-library Bernoulli Naive Bayes comparison trained only
  from labeled non-held-out run records. It requires repeated examples from at least
  two fault-link classes and a no-supported-fault class; held-out records are ignored.
- Model features describe symptoms, coarse probe/coverage state, router and log
  observations. They exclude expected-link labels and rule-ranked candidate links.
  Scores are explicitly relative (not calibrated probabilities); unknown evidence and
  a top-ranked no-fault class produce an abstention. The rule baseline is never
  replaced and remains available when the optional model is absent or invalid.
- Live Monitoring and selected JSON report exports can show the experimental
  comparison, method, training-run count, relative scores and explanatory features.
- Extended held-out evaluation to report optional-model Top-1/Top-3 and abstention
  metrics separately from the rule baseline.
- Added `tools/run_lab_benchmark.py`: fixed seeded scenario sequence, private
  out-of-repository output, explicit lab confirmation, baseline requirements,
  guaranteed restore attempt, and interface/BGP recovery comparison. Delay/loss
  recovery additionally verifies the lab `netem` queue discipline was removed.
- Added a mentor demo and diagnosis pseudocode in `docs/PROTOTYPE_DEMO.md`.
- Fixed the snapshot collector's external output-directory display path; previously
  it could save a `/tmp` snapshot and then fail while formatting the printed path.

### Verification and remaining work
- `npm run lint`: PASS, exit 0. `npm test`: PASS, 67 tests, 0 failures; Node's
  existing experimental module-mocking notice remains. `npm run build`: PASS,
  exit 0; 2565 modules transformed, no oversized-chunk warning.
- Python unit suite for optional model, benchmark sequencing/rollback/recovery,
  collector CLI, diagnosis, incident tracking and telemetry history: PASS, 20 tests.
  Python compileall: PASS. `git diff --check`: PASS.
- Benchmark dry-run, all five-scenario listing, and the label/train/evaluate CLI help
  checks: PASS without Docker access or lab changes.
- Flask/Firestore API integration checks remain BLOCKED in local Python 3.14:
  Flask and `firebase_admin` are missing. Specifically, `tests.test_live_api` fails
  import on missing `firebase_admin`, and `tests.test_telemetry_ingest` fails import
  on missing Flask. No dependencies were installed globally.
- A real five-scenario benchmark and independent held-out evaluation still require
  repeated, operator-controlled runs on the Ubuntu VM. No faults were applied and no
  VM/container or cloud state was changed during this phase.
- No trained model or accuracy claim is included. At least three training examples
  per class and a distinct, independently collected held-out set remain to be
  collected and reviewed.
- UI integration is covered by the frontend contract test, export regression test,
  lint and production build. A full browser sign-in/deployed API check remains an
  operator integration step.
- PS-035 alignment now separates software-complete requirements from operational
  proof still needed. The held-out dataset/run and GitHub ownership transfer remain
  external gates. `origin` currently points to `Loki-7865/A3-PS035-TC262`; no
  repository ownership or collaborator settings were changed.

### Recovery convergence hardening
- The initial benchmark compared one snapshot immediately after restore. The
  recovery poll now checks every 15 seconds for up to four minutes. That fix was
  committed and pushed as `91f2257`.
- VM preflight exposed an unnecessary import of the hosted Flask/Firebase API from
  the local benchmark CLI. Diagnosis and collection-completeness logic now live in
  framework-independent modules shared by the API and CLI. This fix was committed
  and pushed as `faf228d`; no hosted-service packages need to be installed on the VM
  for the lab CLI.
- First VM benchmark safely restored `link_r2_r4_down` and stopped before the next
  fault. Investigation showed interfaces were UP and BGP sessions established, but
  prefix counts differed from the baseline. The recovery checker was corrected to
  compare session establishment independently of transient prefix totals and to
  explicitly verify R4 relearns the withdrawn R5 prefix. This fix was committed and
  pushed as `424b9ac`.
- On the Ubuntu VM, `python3 -S -m unittest tests.test_lab_benchmark` passed all 8
  tests, `fault_lab check` found all five fixed containers running, and the guarded
  benchmark completed all five scenarios. Each fault snapshot was followed by a
  verified recovery snapshot; six non-held-out labels (healthy plus five faults)
  were appended to `/tmp/netscope-benchmark/runs.jsonl`. Run artifacts remain in
  `/tmp`, outside Git.
- The run is development data only. No held-out evaluation or model accuracy claim
  has been produced. Collect an independent held-out set after diagnosis tuning is
  frozen before reporting evaluation metrics.
- Added an explicit `--held-out` mode to the guarded runner so a post-freeze,
  independent six-record batch can be evaluated without mislabeling development
  data. Regression coverage verifies both baseline and fault rows carry the flag.

## UI flow continuity — 17 November 2026
- Login and account creation now return protected-route visitors to the page they
  originally requested. That destination survives switching between login, signup
  and password reset, and unsafe/auth-only destinations fall back to the workspace.
- If a signed-out visitor chooses Save in the demo, the selected scenario is carried
  through login and restored on return. Demo scenario selection is reflected in its
  URL so refresh preserves that context.
- Live Monitoring now links directly into Fault Investigation with the Live source
  preselected; switching sources keeps the choice in the URL.
- Frontend lint: PASS. Production build: PASS (2,566 modules); no chunk-size warning.
- Browser-based visual review was unavailable in this session, so the flow was
  checked by source/build rather than captured in a live browser.

## Live probe measurements redesign — 17 November 2026
- Replaced the long plain-text probe list with a responsive link reachability view.
  Each adjacency groups its two directions and shows reachability state, replies,
  packet loss, average RTT, and a reply-rate bar.
- Added a compact snapshot summary for measured directions, ICMP replies, and
  aggregate packet loss. Unavailable measurements are labeled as missing evidence;
  they are not represented as successful zero-loss probes.
- Kept the point-in-time ICMP limitation visible in the section. Status colors and
  labels distinguish reachable, partial-loss, no-reply, and unmeasured states.
- `npm run lint`: PASS. `npm run build`: PASS (2,566 modules). `git diff --check`:
  PASS. No browser-based visual review was available in this session.
- Follow-up readability pass: increased metric, label, status, and router text sizes;
  strengthened secondary-text contrast; enlarged cards and spacing; switched link
  cards to a single column at intermediate widths to keep directional details legible.

## Fault Investigation experience redesign — 17 November 2026
- Restructured the page around a guided evidence workflow with a clear back-to-dashboard
  action, source cards, a prominent diagnosis action, and distinct result, impact,
  operator checklist, and save sections.
- Added a responsive signal-trace hero visual with a drawing waveform, moving scan,
  and evidence indicators. The animation represents diagnostic signal analysis and
  does not reuse the router/topology animation.
- Preserved demo/live investigation behavior, scenario selection, captured evidence,
  and read-only live telemetry semantics. Added reduced-motion handling.
- Frontend lint and production build pass; `git diff --check` passes. Browser-based
  visual verification was unavailable, so the design has not yet been reviewed in a
  live browser at desktop and mobile sizes.

## Demo lab visualization and explanation pass — 17 November 2026
- Added animated two-way pulses to healthy and degraded topology paths, deeper
  warm-theme router treatments, active health rings, and a broken-link marker for
  failed physical links. Labels make clear that the map is recorded playback and
  pulses are illustrative, not live packets. Reduced-motion preferences are honored.
- Added plain-language interpretations beneath diagnostic findings and evidence
  observations. The diagnostics area now explains the difference between an observed
  symptom and an unconfirmed root-cause hypothesis, with supporting observation counts.
- Restyled the evidence as a chronological timeline with source, device, timestamp,
  observation, and a concise explanation. Added context for reading topology impact
  and incident records.
- Frontend lint, production build, and `git diff --check` pass. Browser visual review
  was unavailable in this session.

## Unified loading experience — 17 November 2026
- Replaced the plain full-screen “Loading NETSCOPE” card with a reusable branded
  signal-sync animation, clearer context-specific messages, and an animated progress
  track. Route transitions and authentication checks now explain what the app is doing.
- Reused the compact version across dashboard summaries, saved investigations,
  report details, demo playback, and live-monitoring snapshot checks. Replaced vague
  loading button/status copy across account, fault-investigation, and refresh flows.
- Added reduced-motion support and descriptive accessibility status text; loading
  announcements identify the task rather than repeating a generic “Loading” label.
- `npm run lint`: PASS. `npm run build`: PASS (2,568 modules). `git diff --check`:
  PASS. Browser-based visual verification has not been performed yet.

## Route transition timing — 17 November 2026
- Kept the animated full-page transition visible for 2.2 seconds after in-app route
  changes so the signal-sync visual has time to register instead of flashing by.
  Inline data refreshes remain immediate and are not held back.
- Lint, build, and diff checks pending.
