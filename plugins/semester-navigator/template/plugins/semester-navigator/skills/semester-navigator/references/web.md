# Web-only starter

A student can begin with a syllabus in ChatGPT without installing local tools.
A public repository marketplace installation is not proof that a plugin is
available in the web plugin directory. Do not claim automatic web installation.

Use this as the student-facing starter prompt when the local plugin cannot run:

```text
Help me set up Semester Navigator from the course materials I attach. Ask only
for missing information, one question at a time. First show the nearest
confirmed deadline and one useful thing I can do today. Keep unknown dates and
grades unknown. Save a compact tracker I can reuse. I am using ChatGPT on the
web, so do not ask me to run commands or open local project folders. After the
first plan, help me create a private dashboard only if the tools in this task
support it. Ask before connecting accounts or scheduling real reminders.
```

## Deliver the first result

Inspect the task's actual attachment, file, browser, and Sites capabilities.
Ask for name, school/term/level/time zone only when the material does not provide
the needed facts. Use [sources](sources.md) and [coaching](coaching.md) to produce
the nearest deadline, next action, and missing critical facts from one source.
Create a compact tracker as an available artifact or downloadable file. Name
where it was actually saved; do not claim it exists on the student's computer.

Continue within the same ChatGPT project/task when useful. On a new task, read
the tracker from accessible project files or connected storage first. Ask for
an attachment/link only when tools cannot retrieve it. Do not promise memory
will preserve the tracker, account boundaries, or completion history.

## Optional hosted dashboard

If the student wants a private dashboard and ChatGPT Work plus Sites tools are
available, use that hosted environment and the available Sites instructions.
Do not require a Windows install, local root, browser extension, or Ctrl+O.
Read the [matching v0.2.0-beta.1 application source](https://github.com/cdionne7/semester-navigator/tree/v0.2.0-beta.1)
or that release bundle as source only; the default branch may still contain
the older implementation. Create fresh student-specific source and storage in
the hosted workspace, with no canonical hosting project ID or prototype
coursework. If the matching source is unavailable, keep the tracker usable and
report the missing release instead of substituting an older application. Use
the supplied course data and current application schema. Obtain approval for
the private Site and verify its project, durable
storage, intended account, and access before claiming it is ready.
If the hosted build uses this application's manifest, initialize a fresh
`.openai/hosting.json` only for that approved Site, with `d1: "DB"`, `r2: null`,
and no copied project ID. Use the available hosted Sites workflow; a local
working-directory change does not select the intended Sites project.

If Sites or durable storage is unavailable, the tracker remains useful. State
the unavailable feature and keep working on planning and feedback. Do not
present local-only scripts or a public Site as the web setup workaround.

For browser sources, use only the current Work browser or approved connectors.
The cloud browser does not inherit the student's normal browser session.
For reminders, follow [reminders](reminders.md) and use only the actual tool
availability. Never infer that a desktop automation exists from web chat text.
