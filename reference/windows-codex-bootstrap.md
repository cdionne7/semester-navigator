# Windows Codex bootstrap

Use this only when Semester Navigator is not already present on the Windows
computer. Paste the following into a new Codex chat:

```text
Install Semester Navigator on this Windows computer using the public installer:

powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod 'https://raw.githubusercontent.com/cdionne7/semester-navigator/main/scripts/install-windows.ps1' | Invoke-Expression"

Run only that command. Do not install Git, GitHub CLI, Node.js, npm, winget, or
other system software. The installer must stop rather than overwrite an existing
Semester Navigator folder. When it succeeds, tell me the exact folder to open
with Ctrl+O. Do not begin student intake, create a student workspace, or deploy
a Site until that folder is open and its root AGENTS.md has been read.
```

The public installer downloads a source ZIP without GitHub authentication. It
uses an existing compatible Node/npm installation when available, otherwise it
downloads a SHA-256-verified portable runtime into the project. A custom GPT may
provide this handoff prompt, but it must not claim that it installed or opened
local files unless Codex confirms those actions.

Setup problems use the browser issue form:
<https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml>
