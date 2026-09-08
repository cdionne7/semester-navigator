# Semester Navigator

Turn a syllabus or assignment prompt into a private semester plan, a clear next
step, and practical study or writing help. Start with one course. Add calendars,
portal connections, verified reminders, and a private hosted dashboard later.

This public repository contains the application and plugin. Student work belongs
in a separate private workspace. The canonical template must never be deployed
as a student's Site.

## Start here

Forward this one link: [Semester Navigator beta setup](https://github.com/cdionne7/semester-navigator/releases/tag/v0.2.0-beta.1).
It provides the desktop bundle, its checksum, and the standalone web starter.
Use the matching prompt below and attach one syllabus or assignment.

This entry targets **v0.2.0-beta.1**. Until that release is published, its page
and downloads are unavailable. Do not substitute the repository's `main`
branch, the old Windows installer, or an unpublished draft release. The beta
source and instructions must travel together.

## Start on your computer

Open a local Codex task in the
[ChatGPT desktop app](https://learn.chatgpt.com/docs/windows/windows-app),
attach your syllabus, and paste:

```text
Set up Semester Navigator beta v0.2.0-beta.1 from:
https://github.com/cdionne7/semester-navigator/releases/tag/v0.2.0-beta.1

First read my syllabus, show my next confirmed deadline and one thing I can do
today. Inspect that exact published release. Download its
semester-navigator-plugin-v0.2.0.zip and matching .zip.sha256, verify the
checksum, and extract the bundle. Use available local tools to register its
marketplace and add the plugin. Do not require Git, GitHub CLI, GitHub sign-in,
administrator access, or system-wide software.

Use the installed skill, or read the extracted plugin's SKILL.md if the new
skill is not loaded in this task. Complete the approved student setup and
verify my saved dashboard. Resume an existing setup if present. If the app
requires a new task or folder selection, give me the exact folder and one
ready-to-copy resume prompt. Keep optional connections, reminders, and hosting
for later. If local tools are unavailable, use the release's web-starter.md.
```

The assistant handles the technical steps. The bundle contains the skill,
setup scripts, application template, and prebuilt dashboard. It asks only for
missing facts and confirms the student, folder, and plan before saving.
Windows can use a verified portable runtime inside the project; this route
does not require installing application dependencies or building the app on
the student's machine.

The local dashboard works on that computer while its server is running. A later
chat can reopen the student project and restart it using the saved instructions.
A private hosted Site is optional for access away from that computer.

[Windows details and legacy recovery](reference/windows-codex-bootstrap.md)
are for the assistant to execute, not a student command checklist.

## Start entirely on the web

Open ChatGPT, preferably Work when available, attach one syllabus, and paste:

```text
Use this Semester Navigator web starter with my attached syllabus:
https://raw.githubusercontent.com/cdionne7/semester-navigator/v0.2.0-beta.1/reference/web-starter.md

First show my nearest confirmed deadline and one useful thing I can do today.
Ask only for missing information. Keep unknown dates and grades unknown. Save
my reusable tracker and importable semester-plan.json using the starter's
format, and link the actual files. I am using ChatGPT on the web, so do not
ask me to run commands or open local folders. Keep account connections,
reminders, and a private Site optional. If you cannot read the starter link,
begin from the syllabus and tell me to attach the downloaded web-starter.md.
```

If needed, download [web-starter.md](https://github.com/cdionne7/semester-navigator/releases/download/v0.2.0-beta.1/web-starter.md)
from the same beta page and attach it to ChatGPT. It needs no custom GPT or
plugin installation. The [repository copy](reference/web-starter.md) documents
the complete portable tracker/import format. ChatGPT must state where the
tracker was actually saved. An ordinary web chat does not provide access to
files on your computer; when file creation is unavailable, the starter provides
reusable tracker text and JSON inline.

The repository marketplace is not a claim that Semester Navigator is published
in the universal ChatGPT plugin directory. Supported public-directory plugins
can work on web and desktop, but this repository's availability must be checked
separately. [Official plugin documentation](https://learn.chatgpt.com/docs/plugins)

Sites is currently a beta feature on Plus, Pro, Business, Enterprise, and Edu,
with plan limits. The assistant checks the actual tools and account before
promising hosting or durable storage. Use your own eligible account; Sites
cannot target children under 13 or the applicable age of digital consent.
Planning with supplied material should remain useful if hosting is unavailable.
[Official Sites documentation](https://learn.chatgpt.com/docs/sites)

## What is real and what needs a connection

- **Saved planning:** Courses, dated tasks, completion, notes, rubrics, resources,
  grade scenarios, and manual imports are stored in the student workspace or
  that student's private Site. Unknown deadlines remain unknown.
- **Source refresh:** The assistant reads an approved file, connector, or browser
  source and previews the changes. Opening the dashboard does not read an LMS.
  Browser access requires the appropriate connected browser/extension and the
  student's protected sign-in when needed.
- **Reminders:** A reminder is scheduled only after a real tool confirms it and
  its schedule is read back. A copied prompt or calendar `.ics` export is not a
  scheduled notification. Local automations need the computer awake and the app
  running; other providers have their own requirements.
- **Writing and research:** Feedback connects rubric criteria to evidence in the
  draft and specific revisions. Research cites verified sources. Estimated grade
  scenarios are separate from the school's official grades.

## Resume or report a problem

Open the existing student project and say “Resume Semester Navigator.” The
profile keeps the completed setup stage, failure information, approved sources,
and student identity. Do not delete the folder, reinstall blindly, or create a
second Site to recover a partial setup.

Share the failing stage and redacted error with the assistant. The
[setup issue form](https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml)
is an optional support channel requiring GitHub web sign-in. Do not include
credentials or private coursework.

## Development and distribution

The maintainer builds and tests the application before packaging a release:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run plugin:build
```

`plugin:build` refreshes `plugins/semester-navigator/template/` and writes
`artifacts/semester-navigator-plugin-v0.2.0.zip`. The archive has one
`semester-navigator/` root containing `.agents/plugins/marketplace.json` and the
complete `plugins/semester-navigator/` directory. Do not distribute a plugin
folder that lacks its template or prebuilt dashboard.

For an already extracted marketplace, an assistant checks the installed CLI's
help before using `codex plugin marketplace add <extracted-root>` and
`codex plugin add semester-navigator@semester-navigator --json`. If a compatible CLI
or app installation tool is unavailable, it must not claim installation. It can
read the bundled skill in an available local task to complete setup, or use the
web starter. Do not silently install a system toolchain.

Implementation entry points:

- [Plugin skill](plugins/semester-navigator/skills/semester-navigator/SKILL.md)
- [Student bootstrap](scripts/bootstrap-student-site.mjs) and [runtime launcher](scripts/run-semester.ps1)
- [Plan schema and normalization](lib/plan-model.mjs), [local server](scripts/serve-student.mjs), and [hosted API](app/api/plan/route.ts)
- [Acceptance evidence and remaining checks](reference/semester-navigator-uat.md)
- [Legacy GPT migration](reference/semester-navigator-gpt.md)

Student bootstraps default to a generic student instance. Legacy family instance
labels remain compatibility data only. New setup does not require separate
custom GPTs, role labels, or a shared ChatGPT account.
