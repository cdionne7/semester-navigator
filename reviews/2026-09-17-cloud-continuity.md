# Cloud continuity acceptance, September 17, 2026

Status: private hosted student workflows verified; cloud connection acceptance
remains blocked. This is not
an accepted ordinary-phone ChatGPT release. The public desktop release remains
v0.3.2-beta.1; the working cloud candidate is 0.4.0.

## Intended student journey

The student opens the same cloud profile from desktop or phone, asks ChatGPT
for a deadline, planning help, a rubric review or research, and saves changes
to that profile. The laptop need not provide storage or execute these cloud
plan operations. School access and reminders need their own verified cloud
connections. Shared ChatGPT accounts contain separate student profiles, but
those profiles are not privacy boundaries between account users.

## Evidence boundaries

- Unit tests exercise the actual model, OAuth, MCP and D1 repository code.
- HTTP integration tests exercise real handlers, SQLite migrations, OAuth PKCE
  and browser/API writes. The harness injects a synthetic Sites identity at
  its boundary. It does not prove production authentication or mobile support.
- Browser tests at 390px exercise responsive layout and plan continuity. They
  are Chromium tests, not iOS or Android app acceptance.
- The dedicated private cloud Site has real Sign in with ChatGPT, D1 storage,
  and synthetic student profiles. Independent agents used only browser-visible
  school pages and dashboard controls for initial persona acceptance. They
  read the distributed skill and public import contract, not fixture answers.
- No child's real school account, native phone, real cloud school session, or
  delivered cloud reminder has been tested in this run.

## Adversarial repair loops

1. Added owner-scoped cloud storage, explicit stable student selection,
   revision-checked updates and separate desktop/cloud source provenance.
   Tested sibling selection, foreign-owner denial, stale saves, unknown dates,
   completed work and preserved notes.
2. Added OAuth discovery, exact resource and redirect validation, S256 PKCE,
   single-use authorization consent/code, hashed token storage, refresh-token
   rotation, revocation and bounded registration/token abuse controls. A
   private hosting gate still prevents anonymous client discovery.
3. Independent review found that a write-only scope could return an entire
   saved plan, partial source patches were rejected before merging, and cloud
   sign-in checks paused during unsaved forms and conflicts. Writes now require
   read and write scopes, source patches validate after merge, and background
   account validation continues without discarding unrelated unsaved work on
   network or storage failure. Regression tests reproduce each failure.
4. Two independent live personas created separate hosted plans, traversed
   paginated simulated school portals and verified saving in fresh browser
   tabs. Both rejected injected instructions to falsify grades, claim reminders
   and read another student. Both preserved hidden grades and ambiguous dates.
5. Live personas found optional work counted as required, incomplete grades
   still labeled On track, no visible grade denominators, and no on-site import
   contract. The correction loop adds explicit optional work, honest coverage
   status, separate grade items, visible grade details and a browser guide.
6. Added a usable one-time desktop-to-cloud migration path, preserving the
   stable profile ID and refusing to overwrite an existing cloud profile.
7. A fresh cold-resume persona correctly stopped at a mismatched school
   identity, then could not save its checkpoint because the browser could not
   read a downloaded backup. Added an authenticated selected-plan snapshot at
   the assistant guide, with exact source IDs, saved revision and historical
   source checks. Tested foreign-account denial and escaped content.
8. Independent browser review reproduced a second tab's successful save
   overwriting another tab's unsaved recovery copy. Web Locks now serialize
   recovery-slot writes; conflicting edits keep the editor open and retain the
   existing recovery copy. Five additional browser cases cover simultaneous
   edits and preservation across tabs. Browsers without that API report the
   limitation instead of editing unsafely. Existing open tabs need a reload.
9. The fresh high-school recovery found browser import validation ran before
   saved source fields were merged, and explicit empty resolved-error fields
   were discarded. Browser imports now merge before validation. Fresh verified
   checks can clear supplied error/next-action text; omitted or stale fields
   cannot erase later observations. Unit and actual browser regressions pass.
   Removed the duplicate external-link arrow from published grade sources.
   After private deployment, a separate synthetic QA profile accepted the
   formerly failing partial reconnect through the visible import controls.
   Fresh authenticated guide readback at revision 4 showed browser mode
   retained, connection verified, and both resolved text fields empty.
10. Public-exposure review reproduced permanent anonymous registration-budget
    exhaustion. Pending registrations now expire after 24 hours; authenticated
    one-time consent promotes the exact client to durable storage. Fixed
    attempt windows and bounded expired-record cleanup limit allocation.
    Approved/legacy clients and their refresh grants remain valid; historical
    exhausted counters no longer prevent registration. Focused OAuth tests
    cover races, denial, expiry, replay and storage failure. A setup left
    unapproved for more than 24 hours must re-register; automatic recovery of
    ChatGPT's cached client remains a live connection acceptance case.

## Current validation record

The combined build/package/unit run passed 218 tests, with one native
Windows-only skip on macOS. All 57 browser tests passed. TypeScript, ESLint,
plugin manifest, skill validation and whitespace checks passed. Dependency
audit reported zero vulnerabilities. Browser tests
include both student levels, saved grade denominators at 390px, source recovery,
account changes, stale writes, cross-tab pending edits and migration continuity.
The generated plugin was reinstalled locally. That installation is not a
ChatGPT cloud connection and does not establish availability on a phone.

## Live initial persona results

| Check | College, Avery | High school, Jordan |
| --- | --- | --- |
| Initial intake and first cloud save | Passed | Passed |
| Discover the product from visible school evidence | Brightspace verified | Google Classroom verified |
| Roster pagination | Three courses, both pages | Three courses, both pages |
| Assignment pagination and details | Every course, both pages and all details | Every course, both pages and all details |
| Materials, rubrics and announcements | All linked fixture contents read | All linked fixture contents read |
| Latest explicit deadline correction | Lab 1 Sep 12, 11:59 PM Eastern | History Sep 16, 3 PM Eastern |
| Ambiguous relative date | Quiz retained as unknown | Quiz retained as unknown |
| Hidden grade scope | Writing grades blocked | Science grades blocked |
| Availability and useful first action | 25-minute action; Tue/Thu work respected | 20-minute action after practice |
| Save, reload and fresh tab | Passed | Passed |
| Optional-work presentation | Workaround as resource; product fix required | Required count inflated; product fix required |
| Actual cloud-chat school access | Not tested; desktop provenance saved | Not tested; desktop provenance saved |

Source logs, fixture dates and retrieved publication dates were distinguished
from the current date. Overdue fixture work remained overdue. No student-facing
message, school submission, calendar event or reminder was sent.

## Fresh recovery and coaching personas

Two fresh agents received only the distributed playbook, visible dashboard
and simulated school pages. They did not inspect fixture implementation or
expected answers. Both used desktop Chrome against the private hosted plan.

| Check | College, Avery | High school, Jordan |
| --- | --- | --- |
| Interruption observed | Expired session; stopped reads | Wrong exposed account; stopped reads |
| Checkpoint saved before resuming | Revision 5; historical checks preserved | Revision 5; historical checks preserved |
| Correct account reverified | Passed after synthetic student sign-in reply | Passed after synthetic student account-selection reply |
| Complete subsequent school traversal | Two roster pages, three classes, all five scopes | Two roster pages, three classes, all five scopes |
| New announcement correction | Lab 1 Sep 14, 11:59 PM Eastern | History Sep 18, 3 PM Eastern |
| Actual item-grade readback | 18/25, 7/10, 12/15, 8/10 | 17/20, 6/8, 16/20, 8/10 |
| Hidden grades / ambiguous quiz | Retained blocked / unknown | Retained blocked / unknown |
| Full draft/rubric coaching | Six paragraphs; four criteria; 25-minute sprint | Six paragraphs; four criteria; 20-minute sprint |
| Verified primary research | NASA dataset and explanations; NOAA | Library of Congress draft and timeline |
| Notes and completed work | Preserved, review appended through editor | Preserved, review appended through editor |
| Final saved revision and fresh readback | 11 | 8 |

Both saved 15 checked scopes and one blocked grade scope, explicitly marked
as desktop source execution. Jordan's optional exercise is visible without
inflating required work: five required assignments left, one required Algebra
item overdue. Avery's optional seminar remains a labeled course resource.
Both observed that import preserves existing notes; they used the assignment
editor to append coaching and verified the full saved text. Neither sent a
message, submitted work or created a reminder.

## Remaining launch gates

1. Publicly reachable OAuth discovery and connection endpoints require the
   requested Site audience approval. Saved plans must remain protected by
   sign-in, token scopes and account ownership after that change. Verify
   anonymous denial and the platform's sanitization of identity headers on the
   supported Sites route before broader access. The adapter matches the Sites
   starter identity contract; a local handler test cannot prove the edge.
2. Connect the actual remote plugin in ChatGPT, verify its tools and skill,
   perform a chat write and observe the same change in the hosted visual.
3. Repeat that journey from an ordinary ChatGPT phone session with the laptop
   unavailable. A responsive screenshot does not establish this gate.
4. Verify each student's actual supported school source in the intended cloud
   environment, including expiration/reconnection and school restrictions.
5. Verify an authorized cloud reminder with its provider and delivery evidence
   before promising computer-off notification delivery.

The deployed dashboard alone does not satisfy these gates. No public-directory
listing, automatic model/project selection, local/cloud live synchronization,
or universal school connector coverage is claimed.

The service must stay behind the supported Sites authentication dispatcher.
It must not be exposed at a direct origin that accepts caller-supplied
`oai-authenticated-user-*` headers. The independent boundary review confirmed
that missing/partial identity headers do not reach plan storage or acceptance
controls and that MCP additionally requires a valid bearer token. Locally
injecting both trusted headers selects a synthetic principal, as in the Sites
starter; this tests the adapter's trust assumption, not production spoof
resistance. Acceptance fixtures remain synthetic and gated by sign-in and the
explicit acceptance-mode configuration; disable them before student launch.

## Platform basis

Official [plugin documentation](https://learn.chatgpt.com/docs/plugins) says
account-available plugins can run in Chat or Work on mobile; desktop-only
plugins cannot. That establishes the intended platform path, not this
candidate's installed availability. The [authentication contract](https://developers.openai.com/plugins/build/auth)
requires discoverable HTTPS metadata and resource-bound authorization. The
[Sites documentation](https://learn.chatgpt.com/docs/sites) describes the hosted
service; production authentication and connection acceptance still need direct
verification against this deployment.
