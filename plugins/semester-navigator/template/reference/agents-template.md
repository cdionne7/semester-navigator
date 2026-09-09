# Semester Navigator student workspace

Read `chatgpt.md` and `.semester-navigator/profile.json` first. Confirm the
student, term, and current root agree before changing files or using a source.
Resume `profile.json.setup` and the current plan's source connections/coverage
instead of repeating completed intake. A runtime setup status does not mean
every class or source category has been checked.

Read `.semester-navigator/playbook/SKILL.md`, then only the reference needed for
the student's request. This bundled playbook supplies setup, import, coaching,
reminder, and web procedures in a fresh chat. Use the installed Semester
Navigator skill when available, while preserving the current student's state.

The current plan is available through the local dashboard API or the private
Site's API. Before the first save, use `app/student-seed.json`. Later local
saves use the envelope in `.semester-navigator/plan.json`; do not overwrite it
while the server is running. Use the import/API revision checks when changing
saved tasks. A source refresh must preserve matching tasks' completion.

Use available tools for technical work. The student handles sign-in, MFA,
CAPTCHA, account selection, and protected prompts. Ask only for missing facts
or authorization that is not already present. For desktop setup, discover the
student's actual school tools and guide supported source connections; no parent
configuration, known LMS name, or uploads are required. Inspect available
connectors and browser tools, then guide protected sign-in one step at a time.
A school Google account is not Classroom access, and a partial product name
does not identify the LMS. Calendar writes and hosting remain optional.

Keep work in this student's approved root and explicitly approved sources.
Before a connected read, compare the exposed account with the intended account.
Check the current course list and per-class assignments, grades, materials,
rubrics, and announcements. Store actual connection/coverage results and the
next action in the plan after each check or interruption. A connected account
can have blocked or unchecked areas. On resume, verify identity/session and
continue that missing scope without erasing earlier coursework.
Stop on an actual student, account, root, or Site mismatch. Never request or
store passwords, cookies, OAuth tokens, or browser-managed credentials.

For local use, start `scripts/serve-student.mjs` through the available runtime
or Windows `scripts/run-semester.ps1` launcher and open its loopback URL.
Read the setup playbook for exact startup and recovery steps. The local URL
works only on this computer; do not expose its server to the network.

A hosted Site is optional. Use only this workspace's verified project and
hosting manifest, dedicated D1 storage, and private audience. Record Site and
access results with the commands included in this student root. Never deploy
from the canonical template or reuse another student's project ID.
Before the first approved hosting action, create this root's actual
`.openai/hosting.json` from its fresh hosting example with D1 `DB`, no R2, and
no project ID. Local planning does not need an active hosting manifest.
Select this student root as the current project before actual Site deployment.

Do not claim an account was connected, a source checked, or a reminder scheduled
without corresponding tool evidence. For real reminders, discover scheduling
tools first, read back the created schedule, and store the verified tool ID.
Calendar exports and reminder plans remain unscheduled until actually imported
and verified. External writes require the student's applicable authorization.

After delivering the requested planning result, run an optional approved update
check once. Preserve private records and Site bindings. A network-only update
failure does not block planning. Report actual conflicts; do not erase them.

Finish with the nearest confirmed deadline, one useful next action, and any
missing critical fact. Continue the requested school coverage checks; offer
optional calendar, reminder, and hosting features after useful planning.
