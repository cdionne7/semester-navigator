# Cloud plan and independent phone use

Use this path when the student wants ChatGPT on their phone with the computer
off, asks for a cloud plan, or has callable Semester Navigator cloud tools.
Preserve an explicit local-workspace choice. Inspect the current chat's actual
tools first. A local repository plugin, an ordinary chat link, and a dashboard
login do not by themselves establish a connected cloud plugin.

## Availability and entry

The current [cloud service acceptance candidate](https://semester-navigator-cloud.cbdionne.chatgpt.site/cloud)
and its [connection guide](https://semester-navigator-cloud.cbdionne.chatgpt.site/cloud/connect)
are candidate entry points until access and saving have been verified in the
student's intended account. Do not describe the candidate as an accepted public
release, an installed plugin, or available in the public plugin directory.
Use an existing verified student dashboard URL when one is already saved.

If cloud plan tools are callable, use them. If they are unavailable, inspect the
supported ChatGPT Work cloud browser and use the authenticated dashboard there.
The student completes protected sign-in and account selection. A browser-based
plan read or save is not an MCP connection. Do not ask a student to enter tokens,
run commands, install the repository marketplace, keep a laptop awake, or have
a parent perform setup. The connection guide's development connection is a
testing path only when that capability is actually available.

If neither authorized cloud tools nor an authenticated cloud browser is usable,
state the specific missing capability. Keep available planning useful and give
the same dashboard link plus one resume request for an environment that supports
it. Do not silently create a competing local plan or require an upload.

## Select the same plan before doing work

With callable tools, call `list_student_plans`, identify the intended student,
school, and term, then call `get_semester_plan` with that returned `profileId`.
If selection is ambiguous, ask one focused question before reading a full plan
or changing coursework. Keep the selected ID explicit in every subsequent tool
request and return its actual `dashboardUrl` when helpful. Read source check
times, coverage gaps, and next actions before repeating setup questions.

With the cloud browser, open the actual dashboard, verify the exposed signed-in
account, select the student and term from **Your saved semesters**, and inspect
the saved plan. When a downloaded backup is unavailable to the browser, read the
authenticated `/cloud/guide?profileId=<selected ID>` page for the current saved
JSON and import contract. It contains only that selected account-owned plan.
Do not infer the account from a profile name or prior chat. After
an edit, observe the saved result, reload that same profile, and check the actual
changed field. A click, copied prompt, pending edit, or connection description
is not proof of a save. Confirm the same change from a fresh chat or browser
view before claiming continuity across devices.

One ChatGPT account may hold multiple student profiles. Everyone using that
account can access its plans. Choose the student explicitly in a new chat;
never select a sibling by the last active dashboard or a matching assignment
title. Verify each school's separately exposed identity before a school read.

## Initial setup without a computer

List existing profiles before creating one. Ask the school first when unknown,
then only missing name, term, school level, and time zone, one focused question
at a time. Infer none of those from a parent/child role. Confirm the compact
student summary and initial save unless already authorized. Use
`create_student_plan` or the dashboard's **Create a semester** form with the
confirmed facts. Preserve the returned profile ID.

After an uncertain creation response, list existing plans and read the matching
student/term before retrying. A repeat of the same name, school, and term selects
the existing cloud profile; it must not erase coursework or change school level.
Do not invent a new name or term to work around a conflict.

Continue school connection and coursework checks from the same saved plan.
Show the first verified deadline and a useful action promptly, then finish the
remaining requested course checks. An empty cloud plan is a saved setup step,
not completed school setup. Runtime files, local folders, and desktop bootstrap
scripts are not prerequisites for this path.

## School sources have separate sign-in

Use [sources](sources.md) for discovery, account verification, pagination, and
per-course coverage. In this path, use actual cloud connectors or ChatGPT Work's
supported cloud browser. Desktop extension instructions apply only to a
desktop browser. A cloud browser has its own sign-in; neither desktop cookies
nor plan-service authorization grants school access.

Reuse existing scoped authorization to connect and read the student's school
sources. Let the student handle protected sign-in, MFA, CAPTCHA, and account
selection. Compare the freshly exposed identity with the intended student
before reading coursework. If identity is initially unknown, ask the student
to confirm the shown identity. A wrong account stops the source read while
preserving the correct student's saved plan. Never store authentication material.

Record `connection.executionContext: "cloud"` only for an actual cloud check.
Saved `"desktop"` or `"unknown"` context does not verify cloud access. Login
alone does not refresh assignments or grades. Read the current roster and each
course's assignments, grades, materials, rubrics, and announcements, following
pagination and document detail links. Preserve hidden grades and unknown dates.
Record `optional: true` only when the source or student explicitly identifies
an assignment as optional. Keep it visible without adding it to required-work
counts, overdue warnings or default study sessions. Store individual observed
scores with their actual denominators in `gradeItems`; keep category policies
and independently weighted contributions in `gradingComponents`. Do not infer
an entire category average from a few visible grade items.

Save observed check times, source links, per-scope evidence, unavailable scopes,
and one next action after each completed check or interruption. An expired
session retains coursework and the historical successful timestamp, marks
access as `needs-sign-in`, and leaves old coverage stale until reread. Resume
from that checkpoint without repeating intake or changing profiles. Uploads
remain a student-chosen fallback.

## Save and coach against the authoritative revision

Read `get_semester_plan` before a change. `update_assignment` patches one
existing assignment; `save_semester_plan` merges new coursework and source
checks without removing omitted records or student notes. Supply the current
`baseRevision`. After a conflict, reread and reconcile the intended edit before
resubmitting. Verify the returned revision and changed field. Never report a
write as saved after an unavailable, unauthorized, or conflicting response.

Use [coaching](coaching.md) for realistic study planning, complete draft and
rubric reads, specific revisions, verified research, and provisional grade
handling. Preserve published item scores separately in `courses[].gradeItems`;
`gradingComponents` contains actual course weights and reported component or
category scores. Do not invent a category average from an individual item.
Verify the saved numerator, denominator, category and source in **Saved grade
details** after a browser save. Use [reminders](reminders.md) only for actual requested reminder work;
choose an available cloud schedule for computer-off delivery and verify it.
Source refreshes and reminder delivery are separate capabilities from plan saves.

Local and cloud stores are separate. A student-approved migration imports the
current local plan once with its stable profile ID, verifies the cloud readback,
and identifies the cloud plan as authoritative for later phone and desktop use.
Do not call the import live synchronization or continue saving independent
writable copies. If the computer is unavailable, resume an existing cloud plan;
do not claim to have imported inaccessible local work.

When `migrate_student_plan` is callable, read the current local saved plan or the
student's chosen current export and list the intended cloud account's profiles.
Confirm the source description, student/school/term, stable profile ID, local
revision and switch to cloud as authoritative unless that exact migration is
already authorized. Pass the complete bare plan, including courses, tasks,
sources and reminders, and `sourceConfirmation` with `sourceDescription`, the
same `profileId` and local `revision`, and `cloudIsAuthoritative: true`.
The tool requires both read and write permission. It inserts only, preserves
the stable profile ID, starts cloud revision 1, and rejects an existing plan for
that account and ID. Its response includes a persisted readback. Compare the
coursework, completed items, notes, source history and reminder provenance before
switching. The local revision is not the new cloud revision. After an uncertain
result, list and read the same ID; never choose a new ID to retry or use migration
to overwrite a saved cloud plan. An existing cloud plan needs a separately
reviewed revision-checked merge instead. Migration does not verify cloud school
access, create cloud reminders, or synchronize later local changes.

The dashboard's ordinary **Import plan** merges into an already selected cloud
profile and is not this stable-ID migration. If the migration tool is unavailable,
keep the local plan authoritative and report that specific limitation. Do not
create an empty cloud profile with a new ID as a migration workaround.

## Browser fallback request

Use the student's actual selected dashboard URL and profile ID when known:

```text
Use Semester Navigator with my saved CLOUD plan at [actual dashboard URL].
My computer is off. If connected Semester Navigator tools are available, list
my saved semesters and load the intended student and term. Otherwise use
ChatGPT Work's cloud browser, let me complete sign-in, verify the signed-in
account, and open the same saved student plan. Ask one question if selection is
unclear. Show my next confirmed deadline and one action, then help me connect
or refresh the school sources I authorize. Verify each school's account before
reading coursework. Save changes to this same cloud plan and read them back.
Do not create a local copy or require desktop setup.
```
