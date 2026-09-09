# Desktop setup and recovery

## Establish what can run

Inspect the current task's actual filesystem, command, and browser tools.
Do not assume that a custom GPT, GitHub connection, or uploaded ZIP grants local
execution. For a desktop request, establish whether this is a local Work/Codex
task before redirecting the student. If the current task has no local tools,
give the one relevant desktop task-selection step and preserve the handoff.
Use [web](web.md) when the student wants web-only work or local execution
remains unavailable; do not present uploads as a completed school connection.

If the current root already contains the matching student profile, use its own
scripts and saved plan to resume or restart the dashboard. Skip template
discovery and initial intake. Continue any incomplete school connection or
coverage check from the saved plan using [sources](sources.md). The bundled
playbook works without the original
plugin or canonical repository; see “Resume a partial setup” below.
For an older `schema_version: 1` profile, or a root missing its launcher/playbook,
follow “Upgrade the verified legacy student folder” below before attempting to
run missing scripts. A bootstrap resume does not upgrade old source files.
For a schema-version-2 workspace, check whether its own `lib/plan-model.mjs`
exports `recordSourceCheck`, `expireSourceAccess`, and `sourceCoverageSummary`
and supports the connection/coverage shape. If any is absent, use “Update an
existing 0.2 student workspace for school connections” below. Do not wait for
the optional after-planning update when the requested feature needs new code.

The normal desktop route uses a prebuilt dashboard bundled with the
[v0.3.0-beta.1 release](https://github.com/cdionne7/semester-navigator/releases/tag/v0.3.0-beta.1).
For an initial download, use its `semester-navigator-plugin-v0.3.0.zip` and verify
the accompanying `.zip.sha256` before extraction. Do not substitute the older default-branch
installer or a GitHub source archive for this prebuilt plugin bundle.
It does not require Git, GitHub CLI, GitHub sign-in, a system Node installation,
or `npm ci` and a full application build on the student's computer. Development
builds and optional Sites deployments have their own prerequisite checks.

Locate the installed plugin root from this skill's location. Its `template/`
directory contains the application, portable-runtime setup, bootstrap, and
prebuilt dashboard. `scripts/resolve-template.mjs` in the plugin root resolves
the bundle or a verified development checkout when a Node runtime is already
available. Do not use that helper as a reason to install Node system-wide.
On a clean Windows machine, the template's `scripts/setup-windows.ps1
-RuntimeOnly` provisions a verified project-local runtime after setup approval.
Use native paths and argument arrays. The separate `run-semester.ps1` launcher
finds that runtime on subsequent commands; it does not install one itself.

If the release bundle is missing its template or prebuilt dashboard, report the
incomplete package and use the web/attachment planning path while correcting
the package. Do not turn a student setup into a source-build troubleshooting
exercise. A repository marketplace is a desktop/CLI distribution route; do not
claim this plugin is listed or installed in ChatGPT on the web.

## Connect the student's school and build the plan

1. Resume a matching profile and source checkpoint before asking new questions.
   For a fresh student with no school identified, start with “Which school do
   you attend?” Ask one focused question at a time. Discover the school's
   actual learning tools from official pages and the student's normal class
   page. Ask where they see assignments only if that remains unclear. Do not
   require the student or parent to know a portal/product name or prepare files.
2. Follow [sources](sources.md) to discover actual connector/browser tools and
   guide the supported connection. “Google for school” may mean school sign-in,
   Classroom, Drive, or another portal. “Bright...” remains unknown until the
   official school link or visible product establishes it. Use existing
   authorization to connect the student's school sources; ask a short scope
   question only when the requested source/account is unclear. The student
   handles their own sign-in and protected prompts. Verify exposed identity
   before reading private course data.
3. Inspect the current course list and ask the student to confirm the term/list
   where the source leaves ambiguity. Check assignments and dates, grades,
   grading rules, materials/rubrics, and relevant announcements for each class.
   Record coverage independently from authentication. Missing grades, unopened
   documents, hidden courses, or blocked pages are not “everything connected.”
   Show the nearest confirmed deadline and one useful action as soon as it is
   available, then continue the rest of the requested term setup.
4. Ask for remaining identity/term/education-level/time-zone facts only when
   tools and visible material cannot establish them. Use the student's own
   eligible account. If eligibility for a requested product is uncertain,
   check its actual requirements and ask without collecting a birth date.
   Recommend a private student/term folder and show one compact summary of
   identity, source access, checked/missing coverage, and what will be saved.
   Confirm that initial save once, unless it is already explicitly approved.

Save an approved partial workspace if an interruption, protected sign-in, or
new task is needed before all course checks finish. Its plan can have an empty
course/task list and a pending source when nothing has been read yet; label
that state accurately. Gather only the identity fields needed by bootstrap,
then persist the connection's actual last result and next action. Do not wait
for every portal to work before preserving useful progress, and do not call
runtime `source_ready` proof that the school scan is complete.

Keep themes, school logos, cloud folders, calendar writes, passkeys, recurring
reminders, and hosted Sites optional. Uploads are a student-chosen fallback,
not the default first question for desktop setup. If access is blocked, state
the exact limitation and next supported step without requiring parent setup.

## Save and open the workspace

Use the deterministic bootstrap in the bundled template. Supply the confirmed
profile ID, display name, school, term, time zone, and student root. Its default
instance is `student`; legacy `son` and `daughter` records remain readable.
Once the applicable age eligibility has been established, supply
`--age-eligible yes`; never set it merely to bypass a failed precondition, and
do not collect a birth date. Include the confirmed `educationLevel` in the
intake's plan (`high-school`, `college`, or `other`).
Use `--intake-file` for the approved structured intake and initial plan, and
`--prepare no` for the normal prebuilt-dashboard path. Do not invent verified
browser states: pending/unavailable details are valid for a saved connection
checkpoint or uploads. A school browser login does not verify ChatGPT Site
access; leave unrelated Site-session fields pending.

The intake JSON contract is `schema_version: 1`, `verified: true`, `plan`,
`expected_accounts`, `approved_cloud_root`, `connected_sources`, and
`preferences`. The plan's student identity must match the bootstrap arguments.
Store an account email only when the student approved it, as
`{"email":"address","storage_approved":true}` under the corresponding account
key; otherwise omit that entry. Do not add credentials or undocumented keys.

On Windows, first run the template's `scripts/setup-windows.ps1` with
`-ProjectRoot` set to the template and `-RuntimeOnly` if a compatible runtime is
missing. Use a process-scoped execution-policy bypass, not a machine setting.
Then use `scripts/run-semester.ps1` with that exact `-ProjectRoot`,
`-Command bootstrap`, and remaining bootstrap arguments. The launcher resolves
the project-local runtime without a persistent PATH change. On other platforms
use an available compatible runtime and the bundled scripts. Construct and
execute commands yourself; do not ask the student to type them.

Verify the bootstrap's returned root/profile and saved intake/seed against the
approved preview. The initial plan is `app/student-seed.json`; the local server
creates its durable `plan.json` envelope after a first save. Do not claim a
tracker file exists before the corresponding tool result establishes it.

Open the generated root as the primary project using an available app tool.
If the product requires a manual folder selection, provide the exact folder
and verify the new project afterward. The new project's `AGENTS.md` loads its
bundled playbook and saved state; the student should not copy a transcript.

Start `scripts/serve-student.mjs --root <student-root> --port 4317` using the
available runtime. On Windows, use `scripts/run-semester.ps1` with `-ProjectRoot`
set to the student root and `-Command start` for the default port. Additional
arguments use native PowerShell `-CommandArguments @('--port','4317')`; do not
append unknown flags to a `powershell -File` invocation. A process-scoped
`-ExecutionPolicy Bypass -Command` can call the script with that argument array.
Open the reported
loopback URL using a browser tool. Verify the student name and imported next
deadline, then verify a saved edit persists. Do not bind the server to the LAN
or describe this local URL as reachable from another device.

Record the working local URL and the next setup action in the student context.
If the port is occupied, identify whether the existing server belongs to this
root; reuse only a verified match, otherwise choose another available port.
On later chats, restart the saved root's server when necessary and reopen it.

## Update an existing 0.2 student workspace for school connections

A 0.2 student root already uses `schema_version: 2` but cannot preserve the new
source contract. Keep its identity, plan, source approvals, and Site binding.
Use the verified 0.3 release's updater against that same student root; the
request to set up/fix these connections authorizes the necessary supported
update. Do not repeat approval already supplied for that work.

Read the current saved plan and ensure any pending dashboard edit is saved or
kept in its recoverable copy. Identify and stop only this root's local server
before updating. Invoke **the new verified template's script**, using its
compatible runtime or the student's existing compatible portable runtime:

```text
node <verified-0.3-template>/scripts/update-semester-navigator.mjs
  --root <existing-student-root> --mode student
  --raw-root https://raw.githubusercontent.com/cdionne7/semester-navigator/v0.3.0-beta.1
  --allow-offline no
```

These are assistant-executed arguments, not a student command checklist. On
Windows, the verified template's `run-semester.ps1 -Command node` can invoke
that absolute script path with `-CommandArguments` as a native PowerShell
array. Do not pass `--raw-root` to the old 0.2 script; that script does not
implement release selection. Keep the new updater's default verification and
rollback enabled. The student mode checks the prebuilt runtime and relevant
tests; it does not install application dependencies or run a development build.

Do not initialize a new update baseline, run canonical recovery, use the
schema-version-1 migration, or copy individual files over this workspace.
The updater must validate its existing tracked files and preserve private
records. On a network failure or managed-file conflict, report the specific
blocker, keep the saved plan, and retain a source-setup next action; do not
claim that the unsupported source metadata was saved.

After a successful update, recheck the helpers in this student root and restart
its server so the API loads the new modules. Verify the same profile and saved
coursework, then use an actual pending or observed source record for an API
save/readback and confirm its connection/coverage fields survive. Do not invent
a verified connection for this check. Resume the actual school-connection step
only with the supported runtime; keep the existing student project and URL.
This local update does not redeploy an existing private Site. Use the verified
local dashboard until a separately approved Site update and hosted API
readback establish support there too.

## Resume a partial setup

Read `profile.json.setup`, including `status`, `last_completed_stage`,
`failed_stage`, and `last_error`. A same-profile existing root is a resume,
not a reason to delete it or create another student Site. Preserve its plan,
source approvals, completed intake, and each plan source's connection/coverage.
A source with partial or blocked coverage resumes from its recorded next action
after identity/session revalidation; do not repeat already checked classes
without a refresh reason. Retry the failed stage only after
diagnosing its concrete cause; report any remaining blocker with one next step.

The normal `--prepare no` path does not require an optional development
dependency/build checkpoint to pass before planning. Use `prepare` only when
the requested development or hosted operation needs it. Do not label a failed
optional Site build as failure of the student's saved local plan.

Check an approved template update once after establishing the active student
and delivering the requested planning result. The safe update check can return
`local_newer` while this beta is ahead of the default branch; retain the
verified beta in that case. Do not downgrade it to the older public source. A
network-only update failure does not block planning. Preserve private records
and report actual conflicts.

## Upgrade the verified legacy student folder

The public `501ddd22889c080ac58e64bed7e68fe83c8a57f2` release created student
folders without a local launcher or update tracking. Their private Site and
original browser can contain newer work than `app/student-seed.json`. Do not
create another student folder, invent a new update baseline, run canonical
recovery against a student folder, or infer that an empty seed means no work.

Use the verified installed beta template's `scripts/migrate-student.mjs`, with
`--root` naming the existing approved student folder. Omit `--apply` for its
read-only check. It accepts only the exact known legacy source and reports
specific changed files or identity conflicts; other versions need review.
The migration reads the installed bundle, so it does not depend on the default
branch having this beta release. Provision/use the template's checked portable
runtime on Windows as described above, then execute the migration script with
that runtime. Do not use the old student's missing launcher for this step.

Before applying, use available approved tools to recover the existing plan:

1. Preserve the original browser's saved copy before reopening the old
   dashboard. That dashboard automatically saves on load. Read the private
   Site's `/api/plan` in its verified account when a Site exists; a response
   contains `{plan}`. Preserve any local plan file too. Do not collect browser
   credentials or assume the current browser has the original device copy.
2. Review differences among the copies with the student when their recency or
   intended facts cannot be established. The legacy format has no save
   revision. Save the reviewed bare plan or `{plan}` response as a local JSON
   input; keep its original student ID, name, and school. This must be the
   complete reviewed plan, including its course/task lists. It is authoritative
   for the new local dashboard, so removed work is not revived from the old
   seed. All earlier local records remain in the migration backup.
3. Show the same student/folder, recovered work count, unknown dates, and the
   local upgrade. Obtain one confirmation if the upgrade has not already been
   authorized. Then run the new script with `--plan-file <reviewed JSON>`,
   `--legacy-data-reviewed yes`, and `--apply yes`.

Use `--use-seed yes` instead of `--plan-file` only for an undeployed root with
no local saved plan after tools or the student have established that its old
browser has no newer work. Still supply `--legacy-data-reviewed yes`. If tools
cannot recover the saved copies or resolve an identity conflict, keep the old
folder and available planning work intact and state the one missing recovery
step. Never set the review flag just to bypass the check.

The migration preserves the old private Site binding and creates a local
backup of all files it changes. It does not deploy, connect accounts, or claim
the old Site is updated. Legacy relative labels such as “Today” become unknown
deadlines until confirmed. Verify the new local dashboard's identity, imported
work, and a saved edit after the script succeeds. If interrupted, rerun the same
migration with the reviewed input; its recorded backup is restored before a
retry. Do not delete the student folder to recover.

## Optional private Site

Offer this when the student wants browser/phone access away from the computer.
Preflight available Sites tools and their current prerequisites before asking
the student to invest in deployment. Load the available Sites instructions.
If the required hosting workflow is unavailable, keep the local plan usable.

Obtain approval for the exact student, private Site, and access mode. Deploy
from the verified student root with its own D1 database and first owner-only
audience. Local-only workspaces have `.openai/hosting.example.json`, not an
active hosting manifest. After hosting approval, use that student's fresh
example to create `.openai/hosting.json` with `d1: "DB"`, `r2: null`, and no
project ID. Never copy the canonical or another student's hosting project ID.
Select the verified student root as the current project before actual Site
deployment. If the current tools cannot change that project, provide the exact
folder selection step and verify the result rather than deploying from the
template. A command's working-directory flag does not switch the Sites project.
Record the tool-confirmed project and URL using the student root's record-site
command. Verify the intended account's access and record-access from that same
root. Keep one project per student workspace; reuse its verified project for
updates. Do not make private coursework public to bypass account access.

Use the application's import flow/API and revision checks, preserving
completion state for matching task IDs. A changed seed is reconciled when the
plan is next loaded; verify the resulting saved plan, not just the deployment.
