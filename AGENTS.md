# Semester Navigator repository instructions

This repository is the canonical Semester Navigator template. It is not a
student workspace and must never be deployed as one.

Before any student setup:

1. Read `README.md` and `reference/semester-navigator-gpt.md` completely.
2. If this is a ZIP-installed Windows copy rather than a Git checkout, run the
   documented safe update check before intake. Continue with the last verified
   version when GitHub is temporarily unreachable; stop on a local-file conflict.
3. Confirm whether this run is for the `son` or `daughter` instance.
4. Detect the operating system and available tools when possible. Ask only for
   machine, account, browser, or permission facts that tools cannot verify.
5. Run the documented intake one question at a time and show the setup summary.
6. Wait for confirmation before creating local files, connecting sources, or
   deploying a Site.

After confirmation, use `npm run student:bootstrap -- ...` to create a new
student-specific root outside this repository. Never copy this repository's
`.openai/hosting.json`, project ID, prototype seed, Git history, or another
student's data into that root. Open the generated root as the primary Codex
project before using Sites. Its first deployment must be owner-only and use its
own D1 database.

On Windows, use native Windows paths and PowerShell syntax. For a first install,
use `reference/windows-codex-bootstrap.md`; the public installer must not require
Git, GitHub CLI, GitHub authentication, `winget`, administrator access, or
system-wide software. It may install the checked, portable Node/npm runtime
inside the project. Run `npm ci` and `npm test` before first use. Do not silently
install system software or change execution policy outside the one installer
process.

Recommend the official ChatGPT desktop app on Windows and offer to open its
official installation page when it is missing. Explain that the desktop app and
the browser keep separate ChatGPT sessions. Before relying on a private Site,
verify the exact normal Edge or Chrome profile that will open it, the signed-in
ChatGPT account, and whether that browser keeps the session after restart. Never
handle MFA, passkeys, or browser credentials for the student.

Do technical work with available tools instead of handing commands or file
editing to the student. Ask for a concise permission when an action requires it,
then perform and verify the action. Leave only sign-in, MFA, CAPTCHA, account
selection, protected browser prompts, and genuinely unavailable choices to the
student or parent.

Never request, display, copy, or store passwords, recovery codes, session
cookies, API keys, OAuth tokens, or browser-managed credentials. Stop on a
student, account, browser-profile, source-root, Site-project, or access-policy
mismatch.
