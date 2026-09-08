# Windows setup

Use the published Semester Navigator plugin in a local ChatGPT desktop task.
The plugin's release contains the template and prebuilt dashboard. The normal
student path uses a verified portable runtime and does not build the app or
require Git, GitHub CLI, a GitHub account, administrator access, or a system
Node installation. See the [README](../README.md) for the current distribution.

If ChatGPT desktop is missing, open its
[official Windows installation page](https://learn.chatgpt.com/docs/windows/windows-app)
first. The student handles the installation/account prompts. A web-only student
can use the [web starter](semester-navigator-gpt.md#web-only-starter) immediately.
Do not ask a web conversation to execute a local Windows command.

Once the plugin is available, the student sends one prompt:

```text
Use Semester Navigator to set up my semester from my syllabus. If I already
started, find my saved setup and resume it. Show my next confirmed deadline and
one thing I can do today. Do the technical work for me and keep optional account
connections, reminders, and hosting for later.
```

The assistant checks local tools, reads the syllabus, confirms the minimal
student/workspace summary, creates or resumes the student root, starts the local
dashboard, and verifies a saved plan. The generated project contains its own
instructions and checkpoint. Use `scripts/run-semester.ps1` to find the portable
runtime on a fresh process; do not assume an earlier command changed PATH.

A normal browser extension is needed only when using that browser's signed-in
school portal. It is not required for a syllabus upload or the local dashboard.
If portal access is requested, verify extension setup in the intended browser
profile and let the student handle sign-in. The app, built-in browser, and
regular browser keep separate sessions.

## Existing source installation

The old public installer remains a developer/legacy recovery route:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod 'https://raw.githubusercontent.com/cdionne7/semester-navigator/main/scripts/install-windows.ps1' | Invoke-Expression"
```

Codex runs it only when that legacy source route is actually needed. It may run
full dependency and build checks; those are not prerequisites for the new
prebuilt student route. Never delete an existing student folder to retry setup.
Inspect its saved checkpoint and resume the matching student workspace.

Report a problem with the failing stage and redacted error, keeping the saved
student plan. The public
[setup issue form](https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml)
requires GitHub web sign-in; it is an optional support channel, not a setup gate.
