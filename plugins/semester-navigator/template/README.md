# Semester Navigator

Turn a syllabus or assignment prompt into a private semester plan, a clear next
step, and practical study or writing help. Start with one course. Add calendars,
portal connections, verified reminders, and a private hosted dashboard later.

This public repository contains the application and plugin. Student work belongs
in a separate private workspace. The canonical template must never be deployed
as a student's Site.

## Start on your computer

Use a local Codex task in the
[ChatGPT desktop app](https://learn.chatgpt.com/docs/windows/windows-app).
The desktop app includes local project work; an ordinary web GPT conversation
does not provide access to files on your computer.

Install the versioned `semester-navigator-plugin-v0.2.0.zip` bundle from
[GitHub Releases](https://github.com/cdionne7/semester-navigator/releases) when
published, then start a new task and attach your syllabus. The bundle includes
the skill, setup scripts, application template, and prebuilt dashboard. A source
checkout also contains the repository marketplace for development.

Paste this into a local desktop task to have the assistant handle installation:

```text
Install Semester Navigator from the latest published semester-navigator-plugin
ZIP at https://github.com/cdionne7/semester-navigator/releases. Inspect the
release and extract the bundle into an appropriate local plugin folder. Use
available desktop tools to register its marketplace and install its plugin;
verify the installed skill in a new task. Do not require Git, GitHub CLI,
GitHub sign-in, administrator access, or system-wide software. If no published
bundle or installation tool is available, explain that exact limit and use the
bundled skill directly when local tools permit, or the repository's web starter.
```

A release is not available merely because the repository exists. If the Releases
page has no published bundle, use the web starter below or the checked-out
marketplace with an assistant; do not assume a private draft is downloadable.

Once the plugin is available, send one prompt:

```text
Use Semester Navigator to set up my semester from my syllabus. If I already
started, resume my saved setup. First show my next confirmed deadline and one
thing I can do today. Do the technical work and save my progress. Keep optional
connections, reminders, and hosting for later.
```

The assistant asks only for missing student/course facts and confirms the folder
and plan before saving. It creates or resumes a private student workspace,
opens its local dashboard, and verifies saving. Windows setup can use a checked
portable runtime inside the project. The prebuilt route does not require
installing application dependencies or building the app on the student's machine.

The local dashboard works on that computer while its server is running. A later
chat can reopen the project and restart it using the saved instructions. A
private hosted Site is optional for access away from that computer.

[Windows details and legacy recovery](reference/windows-codex-bootstrap.md)
are for the assistant to execute, not a student command checklist.

## Start entirely on the web

Open ChatGPT, preferably Work when available, attach one syllabus, and paste:

```text
Help me set up Semester Navigator from this syllabus. First show my nearest
confirmed deadline and one useful thing I can do today. Ask only for missing
information, one question at a time. Keep unknown dates and grades unknown.
Save a compact tracker I can reuse. I am using ChatGPT on the web, so do not ask
me to run commands or open local folders. Keep account connections and reminders
optional. Help me create a private Site later only if the available tools support it.
```

For the full portable tracker/import instructions, attach or paste the
[standalone web starter](reference/web-starter.md). It needs no custom GPT or
plugin installation. ChatGPT can provide a saved artifact or downloadable plan;
it must identify where the tracker was actually saved.

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
