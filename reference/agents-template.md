# Semester Navigator Local Instructions

Before doing any work, read `chatgpt.md` in this workspace root.

## Assistance default

The student is not expected to run commands, edit configuration, interpret
permission models, or troubleshoot setup. Use available tools to do technical
work. When an action needs permission, explain the exact action in one sentence,
ask for that permission, then perform and verify it. Give manual steps only for
sign-in, MFA, CAPTCHA, passkeys, account selection, protected browser prompts,
or an action no available tool can perform.

## Automatic update check

Read `.semester-navigator/profile.json`. When `updates.enabled` is true, run one
safe update check before the first other file-changing or external action in a
new chat:

- On Windows, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update-semester-navigator.ps1 -ProjectRoot "[approved root]" -Mode student`.
- On macOS or Linux, run `npm run semester:update` from the approved root.

The updater may replace only template-managed application files. It preserves
the student profile, Site binding, private `chatgpt.md`, and student seed, makes
a recovery backup, runs the project checks, and rolls back a failed update.
Continue with the last verified version when GitHub is temporarily unreachable.
Stop and explain the exact file when the updater reports a local-change conflict.
When the result is `updated` and `.semester-navigator/site.json` records an
existing deployment, explain that the private Site still needs the verified
template change applied. Ask permission to update that exact existing Site from
this root, then use Sites to update and verify the same project ID, URL, D1
binding, and private audience. Never create a replacement Site for an update.

## Required checks

1. Use the active student, semester, approved local root, expected accounts, machine record, Site access record, and source map recorded in `chatgpt.md`.
2. After the update check and before the first other file-changing or external action, state: `Active workspace: [student], [semester], [approved root].`
3. Work only inside the approved root in `chatgpt.md` and the runtime’s enforced workspace roots.
4. Never read, search, summarize, copy, move, or change another student’s folder, tracker, memory, browser session, Site profile, or connected source.
5. Before using email, calendar, Drive, or a school system, verify the authenticated account against the expected account in `chatgpt.md` when the connection exposes it.
6. Stop before reading or writing when the active student, path, or authenticated account does not match. Explain the mismatch and give the shortest correction step.
7. Before creating, updating, or deploying a Site, read `.semester-navigator/site.json` and verify its profile ID, source root, project ID, URL, access mode, intended viewer account, and dedicated browser profile against `chatgpt.md`.
8. Never deploy a student Site from the canonical template project, another student's root, or another student's `.openai/hosting.json`. A new student requires a fresh Sites project and dedicated storage.
9. Keep the first Site deployment owner-only. Before a student relies on it, verify access in the exact normal Edge or Chrome profile recorded for that student. The ChatGPT desktop login does not establish that browser session. Use only owner-only or selected-user access for private student data, never public access. Record a later access change only after the Sites tool and the intended browser profile both verify it.
10. Ask before external writes, calendar changes, messages, submissions, moving files, changing confirmed tracker facts, or changing Site access.
11. Never request, display, copy, or store passwords, recovery codes, session cookies, API keys, or OAuth tokens. Use browser-managed autofill without inspecting the saved password, and hand MFA, CAPTCHA, Windows Hello, passkeys, Touch ID, and security prompts to the student.

`AGENTS.md` provides project instructions. Filesystem permissions and external-service authentication must still enforce their own boundaries.
