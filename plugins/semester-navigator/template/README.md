# Semester Navigator

Connect your school learning tools in ChatGPT desktop, collect your current
classes and coursework, and build a private semester plan with practical study
and writing help. ChatGPT guides the connection and setup conversation. You
handle your own sign-in and protected permission prompts.

This public repository contains the application and plugin. Student work belongs
in a separate private workspace. The canonical template must never be deployed
as a student's Site.

## Start here

Forward this one link: [Semester Navigator beta setup](https://github.com/cdionne7/semester-navigator/releases/tag/v0.3.0-beta.1).
It provides the desktop bundle, its checksum, and the standalone web starter.
On desktop, use the school-connection prompt below. No parent configuration,
prepared course list, known portal name, or uploaded syllabus is required.
The separate web starter can begin from an uploaded syllabus or assignment.

This entry targets **v0.3.0-beta.1**. If its page or downloads are unavailable,
do not substitute the repository's `main` branch, the old Windows installer,
or an unpublished draft release. The beta source and instructions must travel
together.

## Start on your computer

Open a local Work or Codex task in the
[ChatGPT desktop app](https://learn.chatgpt.com/docs/windows/windows-app)
and paste:

```text
Set up Semester Navigator for me from:
https://github.com/cdionne7/semester-navigator/releases/tag/v0.3.0-beta.1

Ask me which school I attend, then help me connect the school accounts and
websites I actually use, one question or sign-in step at a time. Find my current
classes and check assignments, deadlines, grades, and course materials. Do the
technical setup for me. Tell me when I need to sign in or approve a protected
prompt. Save my progress so we can resume if something stops working. Show my
next confirmed deadline and one thing I can do today. I should not need to
prepare files or have a parent configure my school connections first.
```

ChatGPT identifies the school's actual tools from the student's answers,
official school pages, and the visible portal. “Google for school” does not
prove Google Classroom, and “Bright...” does not prove Brightspace. It checks
available connectors and browser tools, guides the student's own sign-in, and
verifies the account before reading coursework. It then checks the current
course list and each class's assignments, grades, and materials. A connection
can work while some pages or grades remain unavailable; the saved plan states
exactly what was checked and what still needs attention.

The assistant handles installation from the verified release ZIP, including
its checksum and prebuilt dashboard. Giving ChatGPT a repository URL does not
automatically install the plugin, load its instructions, or grant local or
school-account access. It must inspect the task's actual tools, retrieve the
matching bundle, and use the installed skill or read the extracted `SKILL.md`.
If the app requires a new task or folder selection, it gives the exact folder
and one resume prompt; the student does not copy a transcript or start over.

Before the first save, ChatGPT confirms the student, private folder, and what
will be saved. It can save partial connection progress and continue with the
remaining classes. Windows can use a verified portable runtime inside the
project, without Git, GitHub CLI, GitHub sign-in, administrator access,
system-wide software, or an application build. The parent supplies only the
entry link; the student supplies their own school/account choices.

If a browser connection is needed, ChatGPT guides the supported
[extension setup](https://learn.chatgpt.com/docs/chrome-extension) and checks
it in the actual task. Uploads are an optional fallback if the student chooses
them or school access is blocked. ChatGPT names a missing capability instead
of pretending it connected. Calendar writes, recurring reminders, and a
hosted Site remain optional.

The local dashboard works on that computer while its server is running. A later
chat can reopen the student project and restart it using the saved instructions.
A private hosted Site is optional for access away from that computer.

[Windows details and legacy recovery](reference/windows-codex-bootstrap.md)
are for the assistant to execute, not a student command checklist.

## Start entirely on the web

Open ChatGPT, preferably Work when available, attach one syllabus, and paste:

```text
Use this Semester Navigator web starter with my attached syllabus:
https://raw.githubusercontent.com/cdionne7/semester-navigator/v0.3.0-beta.1/reference/web-starter.md

First show my nearest confirmed deadline and one useful thing I can do today.
Ask only for missing information. Keep unknown dates and grades unknown. Save
my reusable tracker and importable semester-plan.json using the starter's
format, and link the actual files. I am using ChatGPT on the web, so do not
ask me to run commands or open local folders. Keep account connections,
reminders, and a private Site optional. If you cannot read the starter link,
begin from the syllabus and tell me to attach the downloaded web-starter.md.
```

If needed, download [web-starter.md](https://github.com/cdionne7/semester-navigator/releases/download/v0.3.0-beta.1/web-starter.md)
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
- **Source refresh:** The assistant reads the student-approved school connector
  or browser source and previews the changes. Uploads also work. It records
  which classes, assignments, grades, and materials were actually checked. Opening the dashboard does not read an LMS.
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
profile keeps the completed setup stage and student identity; the current
plan keeps verified source connections, per-class coverage, and the next
connection step. ChatGPT resumes an interrupted source check instead of asking
for every school detail again. Do not delete the folder, reinstall blindly, or
create a second Site to recover a partial setup.

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
`artifacts/semester-navigator-plugin-v0.3.0.zip`. The archive has one
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
