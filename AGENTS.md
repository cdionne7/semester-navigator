# Semester Navigator repository instructions

This repository is the canonical Semester Navigator template. It is not a
student workspace and must never be deployed as one.

Before any student setup:

1. Read `README.md` and `reference/semester-navigator-gpt.md` completely.
2. Confirm whether this run is for the `son` or `daughter` instance.
3. Run the documented intake one question at a time and show the setup summary.
4. Wait for confirmation before creating local files, connecting sources, or
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

Never request, display, copy, or store passwords, recovery codes, session
cookies, API keys, OAuth tokens, or browser-managed credentials. Stop on a
student, account, browser-profile, source-root, Site-project, or access-policy
mismatch.
