# Semester Navigator student workspace

Private student context. Keep this file and the student records in the approved
workspace. Do not publish them in the application template repository.

## Active student

- Profile ID: `[student-slug]`
- Student: [student name]
- School: [school]
- Term: [semester]
- Time zone: [time zone]
- Approved root: `[absolute local path]`
- Platform: [machine platform]
- Profile created or verified: [YYYY-MM-DD]

Read `.semester-navigator/profile.json` for the current identity, education
level, approved accounts/roots, preferences, and setup checkpoint. Resume its
recorded stage. The student's own eligible account is preferred; a local
profile does not provide access to another person's account.

## Plan and local dashboard

The initial confirmed plan is in `app/student-seed.json`. The running dashboard
loads and saves the current plan through `/api/plan`. Local saves are kept in
`.semester-navigator/plan.json` with revision and seed-baseline metadata; do not
edit that file directly while the server is running. Source refreshes use the
import/API conflict checks and preserve completed tasks.

Start or reopen this root's dashboard using the bundled setup playbook. Record
the working local URL here after a tool verifies it. A loopback URL is available
only on this computer. A hosted Site is optional.

## Student Site

Read `.semester-navigator/site.json` for the actual project, URL, audience, and
verification status. A missing project ID means a Site has not been created.
Never infer a deployment from this template or copy another Site's identifier.

## Connected sources

Read `.semester-navigator/intake.json` for the confirmed source materials,
connection approvals, and preferences. Read the current plan's sources for
actual `connection` and per-course `coverage`, check times/evidence, and next
action. A successful login does not establish assignment, grade, rubric, or
material coverage. A source's latest attempt can fail while its earlier checked
coursework remains useful; revalidate access before claiming a fresh check.
An uploaded syllabus is a manual source. A portal refresh and a dashboard
reload are different actions.

Desktop setup discovers the student's school and actual learning tools, then
guides connector/browser access one question or protected sign-in step at a
time. Do not require parent configuration, a known portal name, or uploads.
Record the current term's course list and each class's checked/missing/blocked
assignments, grades, materials, rubrics, and announcements. Keep incomplete
coverage and its next action visible in this context; the plan is authoritative.

Use only approved source accounts and verify exposed identity before a connected
read. Store approved email addresses in the profile/intake account map and
approved source identity fields, not in general notes/evidence. Keep unknown
accounts and dates unknown; do not treat a missing email as permission to search
an arbitrary account. Verify the observed account against the intended school
identity; persist exact identity values only under approved storage scope. The student handles protected sign-in prompts.

## Working instructions

The operational playbook is `.semester-navigator/playbook/SKILL.md`. Read its
relevant reference for setup, sources, coaching, reminders, or web-only work.
Keep work inside this root and explicitly approved sources. Stop on an actual
student, account, path, or Site mismatch. Preserve recorded grades and due dates
unless the student authorizes a source-supported change.

Use the current tracker before asking the student to provide it again. Give one
next action and the nearest verified deadline before optional setup. Rubric
feedback should cite the draft and show a concrete revision. Research should
cite verified sources. A reminder is scheduled only after a tool confirms it
and the schedule is read back; a calendar export alone is not a notification.

## Continuity

The setup checkpoint is `.semester-navigator/profile.json` under `setup`.
The current tracker is the saved plan described above. After each completed
setup or source-check stage, persist its verified result and next action in
the runtime checkpoint or plan's source connection/coverage, as appropriate.
The runtime `source_ready` state means intake was saved, not that all school
context was read. Resume from that state in a new chat. Do not ask the student to
remember commands, recopy a transcript, or recreate an existing workspace.
