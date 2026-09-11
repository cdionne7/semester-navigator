# Autonomous student acceptance fixture

Run `node tests/acceptance/start-school-portal.mjs`. The first output line gives
the college/high-school browser URLs and evaluator-only evidence directory.
Optional arguments are `--port NUMBER` and `--evidence-dir PATH`.

Give each fresh student agent only its school name and browser URL. It must use
browser pages to discover the provider, verify the exposed identity, read the
current term's three classes, follow pagination/details, and open materials,
rubrics, announcements and drafts. Do not give it these source files, control
files, request logs or an extracted plan. These are evaluator instruments.

The fixture simulates authentication and never accepts credentials or school
writes. It is not evidence of live Google or D2L OAuth, real account access, or
an installed school connector. Draft errors are deliberate student claims for
review. Public NASA and Library of Congress links were checked on 2026-09-10.

The launcher reads `control.json` before every request. Edit a student's
`session` to `signed-in`, `protected-login`, `wrong-account`, `expired`, or
`blocked`. `revisedDeadline: true` changes the instructor correction while the
old listing remains stale. `rosterPage2Blocked: true` makes only that student's
second roster page unavailable. Write the complete control object atomically
when another agent is browsing. The other student's state stays independent.

`requests.jsonl` records sequence, time, method, path, student and status. It
never records request bodies or credentials. The programmatic fixture exposes
`requests`, `getState()`, `setState(student, patch)` and `close()`; file controls
take precedence when configured. Stop the launch process with SIGTERM after
the acceptance journey.

Run `node --test tests/acceptance/school-portal.test.mjs` to check isolation,
pagination, external control, logging, complete draft content and blocked
grades. These tests validate the fixture; they do not test autonomous student
behavior. Evaluate actual agent conversations and request logs separately.

After an agent has saved its plan, run
`node tests/acceptance/audit-student-result.mjs college|high-school STUDENT_ROOT [initial|refreshed]`.
The optional phase defaults to `initial`; use `refreshed` after exposing the
revised announcement. It checks the exact expected correction for that phase,
student identity, all task IDs and completion, grade facts and recorded source
coverage. Its `saved-result-checks` pass does not prove the agent actually read
pages, handled protected login, produced good coaching, or displayed the UI.
Those require separate conversation, browser and artifact evidence.
