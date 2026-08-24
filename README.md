# Semester Navigator

A public application template for creating a private student semester dashboard
with personalized course tracking, daily planning, calendar-capacity review,
and healthy study-block suggestions. The template contains no student records.
Each generated student workspace and deployed Site remains private and
separate. The application runs on [vinext](https://github.com/cloudflare/vinext)
and is set up for OpenAI Sites hosting.

## Recovered Project Material

This repository was separated from its original projectless Codex task on
August 21, 2026. Supporting work from that task is preserved under `reference/`:

- `semester-navigator-gpt.md`: reusable GPT behavior and setup specification
- `chatgpt-template.md`: private per-student workspace context generated during setup
- `agents-template.md`: Codex bridge generated beside each private `chatgpt.md`
- `site-template.json`: non-secret mapping between one student profile and one private Sites project
- `family-gpt-instances.json`: two unbound GPT instance records for the son and daughter first-run workflows
- `semester-navigator-uat.md`: acceptance and adversarial testing notes
- `dashboard-prototype/`: earlier single-page dashboard prototype
- `scripts/bootstrap-student-site.mjs`: fail-closed creation of one isolated student source project
- `scripts/record-student-site.mjs`: post-provision verification and binding of one Sites project

## One-command Windows install

The normal Windows install does not require Git, GitHub CLI, a GitHub account,
`winget`, administrator rights, or a preinstalled Node/npm toolchain. Paste this
into a new Codex chat:

```text
Install Semester Navigator on this Windows computer using the public installer:

powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod 'https://raw.githubusercontent.com/cdionne7/semester-navigator/main/scripts/install-windows.ps1' | Invoke-Expression"

Run only that command. Do not install Git, GitHub CLI, Node.js, npm, winget, or
other system software. The installer must stop rather than overwrite an existing
Semester Navigator folder. When it succeeds, tell me the exact folder to open
with Ctrl+O. Do not start student intake or deploy anything yet.
```

The installer downloads the public source ZIP into
`Documents\Codex\Semester Navigator`. When needed, it installs a SHA-256-verified
portable Node.js/npm runtime inside that project, runs `npm ci`, builds the
application, and runs the full test suite. It does not change the machine-wide
`PATH` or store GitHub credentials.

On later runs, `scripts/setup-windows.ps1` checks the public `main` branch for a
safe update before setup. It updates only tracked template files, stops on a
local-file conflict, keeps a recovery backup, and verifies the result. Git,
GitHub CLI, and GitHub authentication are not required.

For normal Windows use, install the official
[ChatGPT desktop app](https://learn.chatgpt.com/docs/windows/windows-app). The
desktop app is recommended for chats and project work. Hosted Sites still open
in Edge or Chrome and require that browser profile to have its own persistent
ChatGPT session.

After setup, press `Ctrl+O` in the ChatGPT desktop app, open the reported folder,
and paste:

```text
Read AGENTS.md completely, confirm setup passed, and start the first-use student
setup one question at a time. Detect what you can, recommend the safest option,
and do the technical work after asking for any required permission.
```

If the project folder is already present, run this from that folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

That command also performs the automatic public-repository update check. If
GitHub is temporarily unavailable, it keeps the last verified local release.

Report installation problems with the browser form at
<https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml>.
Submitting an issue requires a normal GitHub web sign-in, but never GitHub CLI
permissions. Do not include credentials or student data in an issue.

The custom GPT supplies the setup conversation and handoff. Codex runs the
installer and performs local project work. The custom GPT must not claim it
placed files on the Windows computer without a confirming Codex tool result.

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` stores one profile-bound semester plan per private Site
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

The root Sites project is the generic prototype. A student GPT must create a fresh source project inside that student's approved root and receive a new Sites project ID. Never copy this repository's `.openai/hosting.json` into a son or daughter workspace; doing so would point both workflows at the same hosted Site.

## Per-student Site bootstrap

After one GPT instance has completed and confirmed its student intake, run the bootstrap once for that student. The target must be a new absolute path outside this repository:

```bash
npm run student:bootstrap -- \
  --instance "son" \
  --profile-id "student-specific-slug" \
  --display-name "Student name" \
  --school "School name" \
  --semester "Fall 2026" \
  --timezone "America/New_York" \
  --machine-platform "windows" \
  --device-mode "own-device" \
  --desktop-app "installed" \
  --site-browser "edge" \
  --student-root "/absolute/private/student-site-root" \
  --browser-profile "Student name - School - Edge" \
  --browser-session "verified" \
  --browser-session-persistence "verified" \
  --passkey-status "enabled" \
  --site-viewer-email "approved-viewer@example.com" \
  --store-site-viewer-email "yes" \
  --automatic-updates "yes" \
  --age-eligible "yes" \
  --shared-chatgpt-account "yes" \
  --prepare "yes"
```

Codex constructs and runs this command after the setup summary is approved; the
student should not have to type it. Run it separately from the other GPT with
`--instance "daughter"`, a different profile ID, a different absent target root,
and a different named browser profile. Each result contains a fresh
`.openai/hosting.json` with D1 requested and no `project_id`. It also replaces
the prototype seed with the confirmed student's name and school and an empty
course/task list, so prototype grades and assignments are never copied into a
student Site. By default the bootstrap installs dependencies and runs the full
tests in the generated student root.

Open the resulting student root with `@Sites`, create one owner-only Site, and let Sites write its new project ID into that root's hosting manifest. Then bind only the tool-confirmed deployment:

```bash
npm run student:record-site -- \
  --student-root "/absolute/private/student-site-root" \
  --profile-id "student-specific-slug" \
  --project-id "tool-confirmed-project-id" \
  --url "https://tool-confirmed-url" \
  --access "owner-only"
```

The recorder stops on a root, student, browser profile, D1 binding, project ID,
or access mismatch. The generated Site stores its plan in that Site's dedicated
D1 database and uses profile-scoped browser storage only when D1 is unavailable.
Neither command accepts or stores an LMS password. School sign-in remains in the
dedicated browser profile through browser-managed autofill and student-handled
MFA or security prompts.

After deployment, open the exact Site URL in the student's recorded normal Edge
or Chrome profile. An authenticated desktop app does not authenticate that
browser. Keep owner-only access when the Site owner account is the intended
viewer. Where Sites supports selected-user sharing, add only the approved
student account after explicit confirmation. Never use public access for grades,
assignments, email addresses, or coursework. Follow the official
[Sites access guidance](https://learn.chatgpt.com/docs/sites) for the available
audience controls, then record the verified result:

```bash
npm run student:record-access -- \
  --student-root "/absolute/private/student-site-root" \
  --profile-id "student-specific-slug" \
  --access "owner-only" \
  --viewer-emails "approved-viewer@example.com" \
  --browser-profile "Student name - School - Edge" \
  --verified "yes"
```

Omit the `--viewer-emails` argument when storing the address locally was not
approved. The recorder rejects public access, an unverified browser test, or a
student/browser mismatch.

## Automatic student updates

Each generated student workspace includes a safe updater. When automatic
updates are approved, its `AGENTS.md` tells Codex to run one update check at the
start of a new working chat. On Windows, Codex runs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update-semester-navigator.ps1 -ProjectRoot "C:\exact\student\root" -Mode student
```

The updater uses the public repository without Git or a GitHub login. It
preserves `chatgpt.md`, the student profile, Site record and project ID, hosting
manifest, private seed, and Site database data. It stops rather than overwrite a
locally changed managed file. Changed template files are backed up; dependencies
and tests are refreshed; a failed verification is rolled back automatically.
If files changed and that student already has a deployed Site, Codex explains
which existing private Site needs the update, asks permission, and then uses
Sites to update and re-verify that same project. It must not create a replacement
Site during an update.

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run semester:update`: safely update an installed canonical or student workspace
- `npm run student:bootstrap -- ...`: create one new isolated student Site source root
- `npm run student:record-site -- ...`: record a Sites deployment only after exact binding checks pass
- `npm run student:record-access -- ...`: record verified private Site audience and browser access

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
