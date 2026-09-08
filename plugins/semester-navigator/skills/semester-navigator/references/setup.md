# Desktop setup and recovery

## Establish what can run

Inspect the current task's actual filesystem, command, and browser tools.
Do not assume that a custom GPT, GitHub connection, or uploaded ZIP grants local
execution. If local tools are unavailable, use [web](web.md) immediately.

If the current root already contains the matching student profile, use its own
scripts and saved plan to resume or restart the dashboard. Skip template
discovery and initial intake. The bundled playbook works without the original
plugin or canonical repository; see “Resume a partial setup” below.

The normal desktop route uses a prebuilt dashboard bundled with the release.
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

## Get to a useful plan

1. Read an existing student profile and setup checkpoint first. If none exists,
   ask how to address the student. Determine school, term, education level, and
   time zone from supplied materials and tools; ask only for the missing facts.
   Use the student's own eligible account. If eligibility for a requested
   product is uncertain, check current official requirements and ask a clear
   question stating the actual requirement, without collecting a birth date.
2. Ask for one available syllabus, assignment prompt, course export, or portal
   link. A student with no material can still create a small plan with an
   explicit “find the syllabus” next action. Do not require account connections.
3. Follow [sources](sources.md) to extract a compact preview. Show the next
   confirmed deadline and one action the student can do today. Keep missing
   dates unknown; a full course inventory is not a prerequisite.
4. Recommend a new private student folder using a readable student and term
   name. Show the student, school/term/time zone, source preview, folder, and
   what will be saved. Ask for one confirmation. This approves the local
   workspace and local dashboard, not calendar writes or hosted deployment.

Keep themes, school logos, email, cloud folders, calendar integration, passkeys,
and recurring reminders optional after the first useful plan. Upload-based
setup does not require choosing or restarting a browser profile.

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
browser states: pending/unavailable browser details are valid for uploads.

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

## Resume a partial setup

Read `profile.json.setup`, including `status`, `last_completed_stage`,
`failed_stage`, and `last_error`. A same-profile existing root is a resume,
not a reason to delete it or create another student Site. Preserve its plan,
source approvals, and completed intake. Retry the failed stage only after
diagnosing its concrete cause; report any remaining blocker with one next step.

The normal `--prepare no` path does not require an optional development
dependency/build checkpoint to pass before planning. Use `prepare` only when
the requested development or hosted operation needs it. Do not label a failed
optional Site build as failure of the student's saved local plan.

Check an approved template update once after establishing the active student
and delivering the requested planning result. A network-only update failure
does not block planning. Preserve private records and report actual conflicts.

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
