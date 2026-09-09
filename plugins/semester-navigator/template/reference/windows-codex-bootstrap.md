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
Use Semester Navigator to set up my semester. Ask which school I attend and
help me connect the school accounts and class websites I use, one question or
sign-in step at a time. Check my classes, assignments, grades, and materials.
Do the technical work and save my progress. If I already started, resume that
setup. Show my next confirmed deadline and one thing I can do today.
```

The assistant checks local tools, identifies the actual school sources, guides
connection/sign-in, and verifies the source account and per-class coverage.
It confirms the minimal student/workspace summary, creates or resumes the
student root, starts the local dashboard, and verifies a saved plan. No parent
configuration or uploaded syllabus is required. Blocked source checks retain
a specific next action; they do not erase the useful plan. The generated project contains its own
instructions and checkpoint. Use `scripts/run-semester.ps1` to find the portable
runtime on a fresh process; do not assume an earlier command changed PATH.

A normal browser extension is needed only when using that browser's signed-in
school portal. Follow the skill's source-connection procedure for the supported
browser plugin/extension, Manage state, and Work/Codex task browser selection.
Verify the actual source account and let the student handle protected sign-in.
A working connection is not proof of complete class coverage. Uploads remain
an optional fallback, and the local dashboard does not need a school session.
The app, built-in browser, and regular browser keep separate sessions.

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
