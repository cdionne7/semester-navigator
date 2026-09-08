# Semester Navigator repository instructions

This repository is the canonical public template and plugin source. It is not a
student workspace and must never be deployed as one. Keep student records,
account information, private coursework, and generated student roots outside it.

## Student-facing work

Read `README.md` and
`plugins/semester-navigator/skills/semester-navigator/SKILL.md`, then only the
relevant setup/source/coaching/reminder/web reference. The legacy custom GPT
file is a migration entry, not the setup specification.

Check the actual execution environment. Use local desktop tools for the plugin
route; use `reference/web-starter.md` for a web-only student without requiring
Windows, local folders, or a repository marketplace installation.

Read an existing student profile and checkpoint before repeating intake. Use
one private student root and a stable student profile ID. Do not require the
roles son/daughter, separate custom GPTs, shared logins, browser-profile creation,
or account connections for an uploaded syllabus.

Extract a useful first plan from the available course material. Ask only for
missing facts, one focused question at a time. Confirm the student, school,
term/level/time zone, proposed private root, source preview, and initial save
before creating the workspace. Do not connect sources or deploy a Site merely
because local setup was approved.

After confirmation, use the deterministic bootstrap with verified intake JSON
and `--prepare no` for the prebuilt dashboard. Create a new root outside this
repository or explicitly resume its matching profile. Never copy this root's
hosting project ID, prototype coursework, Git history, or another student's data.
The generated root must contain its own playbook, profile, seed, launcher, and
recorders. Verify the plan and saving after opening that root's local dashboard.

On Windows, use native paths and the documented launcher. When needed, use the
project-local verified runtime with `setup-windows.ps1 -RuntimeOnly`; the normal
prebuilt student route does not run npm ci or a full development build. Do not
install system software, require Git/GitHub CLI/authentication, or change the
machine-wide execution policy. The assistant executes available technical work.

Account connections, actual reminders, and hosted Sites are optional and require
the student's applicable authorization. Use their own eligible account, verify
exposed source identity before a connected read, and let them handle protected
sign-in/MFA/CAPTCHA/account prompts. Never request or store credentials.

For a requested Site, preflight current tools and limits, load the available
Sites instructions, and deploy only from the verified student project. Its
first deployment is owner-only with dedicated D1 storage. Record and verify the
actual project, URL, audience, and intended account. Never make private student
data public or reuse the canonical or another student's project to bypass a
blocker. Keep the saved plan usable when optional hosting is unavailable.
Create the actual student hosting manifest only after hosting approval, using
its fresh `.openai/hosting.example.json` with D1 `DB`, no R2, and no project ID.
Verify the active Sites project selection; a shell working-directory flag does
not switch that project.

## Repository development

Keep the plugin and bundled student playbook consistent with executable command,
model, and checkpoint contracts. Use the relevant tests to verify behavior;
matching instruction text alone is not evidence of successful setup.

Before packaging, run the documented development checks and generate the
prebuilt dashboard and self-contained plugin template. A release ZIP must work
without the original checkout. Do not label a draft release published or a
repository plugin installed in the public ChatGPT directory.

Preserve private records and hosting bindings during updates. Run optional
approved update checks after identity verification and the first useful planning
result; a network-only update failure does not block ordinary planning.
