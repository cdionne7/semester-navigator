# Semester Navigator implementation and acceptance

Review date: September 8, 2026. This supersedes the original baseline verdict for
the changed implementation, not for the still-running legacy custom GPT.

## Delivery decision

The public repository is the maintained source. The desktop plugin bundles a
skill, its focused references, deterministic setup/recovery scripts, and a
prebuilt dashboard. The separate web starter works from attachments and saved
artifacts without a plugin, repository checkout, or local command line. A private
Site is optional when the student's account and available tools support it.

The first result is one confirmed deadline and a useful next action from one
course. Account connections, themes, calendars, reminders, and hosting do not
block that result. A confirmed local setup creates one private student folder;
it does not install application dependencies or build an app. Normal local
workspaces contain an example hosting configuration only, so ordinary planning
does not trigger website setup.

## Implemented behavior

- Classes, real deadlines, unknown dates, completion, notes, rubrics, source
  evidence, resources, availability, reported grades, and grade scenarios have a
  validated shared model. Day views use the student's timezone and current date.
- Local JSON and optional hosted D1 storage use revision-checked saves. Failed
  reads cannot authorize writes. Failed saves retain a device copy. Competing
  tabs keep the student's copy instead of overwriting newer work.
- Partial source imports preserve completed work, student notes, known course
  metadata, scores, denominators, resources, and existing rubric details. Clearing
  a confirmed fact is a deliberate edit. Seed updates use a separate three-way
  reconciliation so local changes survive redeployment.
- Grades require actual maximum points. Provisional category averages do not
  consume their entire final-grade weight. Incomplete policies suppress final
  projections; reported grades remain separate from calculations.
- Mistaken classes or assignments can be removed and restored with Undo.
  Unknown effort is shown as an estimate still needed. Editing notes retains
  exact seconds and confirmed daylight-saving offsets in the deadline.
- Rubric, research, and study buttons prepare a task-specific ChatGPT handoff.
  They do not pretend to invoke an AI service inside the dashboard. Reminder
  records require confirmed provider evidence; downloaded calendar files remain
  clearly unscheduled until imported and verified.
- Setup checkpoints distinguish saved intake, dashboard startup, first successful
  save, and failed optional preparation. Each student keeps the playbook and
  runtime needed to reopen without the original repository/plugin directory.
- ZIP updates use immutable source revisions, detect local conflicts, preserve
  private state, and roll back failed verification. An older public branch cannot
  downgrade a newer installed release. Portable Windows Node is checksum-checked
  and kept inside the project, without administrator access or persistent PATH
  changes.

## Adversarial loops and evidence

1. The [baseline review](2026-09-08-self-service-review.md) found setup, runtime,
   state, identity, empty-screen, date, and test-quality failures.
2. Model, API, installer, updater, and detached-bundle probes exercised actual
   failure paths, concurrent saves, process crashes, source reconciliation, and
   installation recovery.
3. Browser loops exercised the college and high-school interface, failed loading,
   failed saving, queued edits, conflicting tabs, import previews, removal/Undo,
   mobile dialogs, and exact deadline preservation.
4. The [college forward walkthrough](college-forward-loop.md) used a raw syllabus
   with an embedded hostile instruction. Setup, saving, a source correction, and
   reopening without the original plugin all worked. It found the effort-display
   defects subsequently fixed and retested.
5. The [high-school web walkthrough](high-school-forward-loop.md) produced a
   reusable tracker, JSON, rubric feedback, and a clearly unscheduled reminder
   file. It found a valid microsecond timestamp rejected on import. The unchanged
   artifact passed after the parser correction.
6. The [final release probes](final-release-adversarial-loop.md) found partial
   imports losing existing facts and note edits altering exact timestamps. Both
   were corrected with regression coverage. Lost-response recovery also passed.
7. The first native Windows run exposed a silent startup failure when executable
   paths resolved differently, plus test cleanup waiting for an exit already
   emitted after signal termination. Both were reproduced locally, corrected,
   and covered by actual-process regressions. The Windows rerun verifies the
   complete portable-install and detached-student path.

The hosted path was additionally built from a generated, isolated college
workspace after a fresh `npm ci`. Its actual Worker and local D1 accepted browser
edits, persisted them through reload and server restart, and rejected a stale
save. This did not deploy the canonical template or any real student's Site.

Final local checks passed: `npm run lint`, `npm run typecheck`, `npm test`
(64 passed, one native-Windows test skipped on macOS), and all 11 Chromium
end-to-end tests. The dependency audit reported zero vulnerabilities. Native
Windows CI is recorded below when its run completes. The Linux GitHub workflow
passed at commit `dc68a71e6aa89a67d85c544da48b5193ffa45c6d`.

The actual CLI registered the repository marketplace and installed
`semester-navigator@semester-navigator` version `0.2.0` initially. The final local iteration uses
`0.2.0+codex.20260908220424`. Its cache resolver
reported `source: bundled` and `dashboard_ready: true`. A new ephemeral Codex
session, without this review conversation, loaded that installed skill and
returned the correct college deadline, date-only/unknown distinctions, a useful
first action, and a read-only setup preview. It ignored the injected request to
falsely mark reminders scheduled. That check verified skill discovery and the
first response; the full saves and reopening were exercised separately.

A second fresh, read-only Codex session opened the existing student project
without the original source bundle. It read the generated instructions and
persisted plan, resumed without intake, and correctly recovered the completed
lab, its corrected deadline, the student's exact saved note, and the two
remaining assignments. It kept the ambiguous quiz date unconfirmed and used
the saved work schedule when suggesting the next action.

## Boundaries of the result

This is a student pilot candidate, not proof that every school/account combination
works. The student's real LMS permissions, protected sign-in, ChatGPT feature
eligibility, private Site audience, and actual reminder delivery must be checked
in that account. The current review task had no automation tool, so it tested the
honest unavailable-tool path and calendar artifacts, not a delivered notification.

These walkthroughs used synthetic students and materials. They do not establish
where the user's son stopped; that remains unknown without his saved setup state
or original conversation. Source refresh is an assistant action against approved
materials, not a background LMS integration. Web artifacts need accessible saved
files on later chats; conversation memory alone is not the data store.
