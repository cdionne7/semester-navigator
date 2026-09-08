# Semester Navigator acceptance evidence

Review date: 2026-09-08. This file distinguishes observed results from required
checks. A build passing, an instruction mentioning a safeguard, or a historical
GPT conversation is not evidence that a student completed installation.

## Recorded checks

| Check | Evidence/status |
|---|---|
| Skill metadata and scaffold | Plugin Creator validator and Skill Creator validator passed for the new plugin. |
| Self-contained template resolution | Five resolver tests passed: detached bundle, missing dashboard, rejection of a student workspace as template, explicit-only development fallback, and CLI invocation through a filesystem alias. |
| Playbook reference integrity | All skill Markdown references resolved; generated-context templates no longer contain empty tracker/status/source placeholder rows. |
| High-school forward walkthrough | First plan, date integrity, rubric feedback, and unscheduled reminder labeling passed with zero extra questions. Found and fixed a real first-import rejection of valid microsecond ISO timestamps. The original unchanged artifact then passed actual normalization, revision-checked import/save, and readback in an isolated adapter. See the [walkthrough evidence](https://github.com/cdionne7/semester-navigator/blob/v0.2.0-beta.1/reviews/high-school-forward-loop.md). |
| Import preview while a save is pending | Real Chromium test first reproduced HTTP 409: an assignment save completed at revision 1, then an older import preview sent `baseRevision: 1` with `plan.revision: 0`, incorrectly disabling edits as a conflict. After the editor stamped current revision metadata, `npx playwright test tests/e2e/import-race.spec.mjs --workers=1 --output=/tmp/semester-import-race-final-e2e` passed (1 test). Both writes succeeded with matching revisions; imported source dates and the new manual assignment survived API readback and browser reload. |
| Current application/model/runtime suites | `npm test` builds both runtimes, regenerates the release, and runs model, real HTTP, hosted-route, updater, bootstrap, and ZIP tests. Final local run: 75 passed, one native-Windows test skipped on macOS. TypeScript and ESLint passed; the dependency audit reported zero vulnerabilities. |
| Detached release ZIP setup | `tests/distribution.test.mjs` extracts and verifies the actual ZIP, bootstraps college and high-school roots without npm dependencies, removes the source bundle, and starts each student root. Passed. The independent college browser/API walkthrough also saved, refreshed, and reopened without its source bundle. |
| Native Windows clean-machine setup | [Run 34285203832](https://github.com/cdionne7/semester-navigator/actions/runs/34285203832) passed at `76d30e6`: portable runtime install with no Git/Node/npm on PATH, intentional dependency failure, fresh-process resume, unchanged source baseline after isolated verification, fresh launcher/lint, and independent student startup after removing the template. Its Node suite passed 68 checks with one platform-specific alias skip. |
| Hosted runtime | An isolated generated college workspace passed `npm ci` and `npm test` (25 tests). Its actual built Worker and local D1 accepted a browser save, retained it on reload and server restart, and rejected a stale revision with HTTP 409. This is runtime evidence, not live Sites account-access verification. |
| Hosted Site and authenticated source access | Production owner-only access, student account eligibility, and school portal connections still require the intended student account. No canonical template or real student Site was deployed in this review. |
| College forward walkthrough | Tool-executed from a copied plugin bundle, with an injected source instruction, exact/date-only/unknown deadlines, grade weights, completion/notes, source correction, and reopening. Passed; effort-display defects were found, fixed, and covered by browser regression. See [evidence](https://github.com/cdionne7/semester-navigator/blob/v0.2.0-beta.1/reviews/college-forward-loop.md). |
| Browser journeys | Full Chromium suite passed all 11 cases, including the final import-race, corrections, and exact-deadline regressions. Desktop and 390px mobile screenshots were inspected. |
| Verified legacy student migration | Six offline cases passed against the captured public `501ddd` generated source: private Site binding, completed work/notes, deliberate deletions, unknown-source/identity refusal, failed verification rollback, process interruption, and safe retry. The selected recovered plan is authoritative; old local files remain backed up. |
| Actual reminder delivery | Not established by a saved dashboard record or ICS export. Requires scheduling-tool readback and a verified delivery test. |

## Forward walkthrough protocol

Give an independent reviewer only the maintained skill, README/web starter,
synthetic student request, and raw course material. Do not give the expected
answer or previous review findings. Use an isolated temporary workspace and
synthetic identities. Do not connect accounts, schedule real reminders, or
publish Sites as part of this test.

Record the steps actually taken, artifacts produced, extra questions or setup
requirements, and any inability to continue. A discovered failure remains a
failure until its correction and repeat check are recorded.

For high-school setup, include one exact deadline/time, one date without time,
one ambiguous relative deadline, a rubric, no known grades, a browser-only
student, and a request for a reminder when no scheduling tool is available.
Inspect the generated tracker/JSON and any calendar export directly.

## Release acceptance cases

| Student situation | Required observable outcome |
|---|---|
| One syllabus and no connected accounts | Shows a confirmed next deadline and one useful action before optional setup. Saves approved data without requiring a portal, calendar, theme, or browser-profile change. |
| Web-only student | Produces a usable tracker/JSON artifact with actual save links, no Windows commands or local-folder gate. Offers a private Site only if hosted tools are available. |
| No syllabus yet | Keeps dates/grades unknown and offers one concrete way to obtain missing material. Does not fabricate a course list. |
| Interrupted after intake or failed optional build | Resumes the same student root and saved checkpoint, keeps confirmed data, and retries only the needed stage. A failed optional build does not prevent using the prebuilt plan. |
| New desktop task with no prior conversation | Reads the generated AGENTS, bundled playbook, profile, and current plan; does not require the original GPT or copied transcript. |
| Browser extension absent | Detects that before portal extraction, offers the supported extension setup or manual upload, and does not claim the source was checked. |
| Wrong student/account/root | Stops before using the mismatched source; does not rewrite identity to bypass the check. |
| Dashboard reload after saved edits | Preserves tasks, completion, notes, source state, and the active student through the actual storage/API. |
| Later source import | Keeps stable task IDs and completed/local work; previews source changes and verifies the resulting saved plan. |
| Two tabs or devices save concurrently | A stale revision is rejected; the newer plan is not silently overwritten. |
| Unknown deadline or partial grading weights | Keeps the date unknown and labels partial grade calculations; no fabricated midnight, grade, or final projection. |
| Reminder tool unavailable | Stores a reminder plan or provides an ICS export, clearly unscheduled. |
| Real reminder requested | Creates only the student's requested schedule, reads it back, stores its tool ID, and states the provider's verified runtime requirements. |
| Optional Site unavailable | Keeps the first plan usable and identifies the actual account/tool/limit blocker. No public or sibling Site workaround. |
| Optional Site created | Uses the verified student root, a fresh project/D1, owner-only first audience, exact intended account access, and persistence readback. |
| Plugin bundle missing assets | Reports an incomplete release before creating a student workspace; does not force a beginner through a development build. |
| Update unavailable or conflicting | A network-only failure does not block planning; a real file conflict is named and private state is preserved. |

## Historical result scope

The earlier custom-GPT notes reported successful conversational planning and
study responses. They did not demonstrate the complete install → import →
save → restart → refresh journey. The custom GPT is now a legacy migration
entry. Historical “passed” labels must not be carried forward as validation of
the plugin or the new application.
