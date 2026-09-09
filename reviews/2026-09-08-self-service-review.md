# Semester Navigator self-service adversarial review
Date: September 8, 2026

Historical baseline review, written before the plugin fixes. See [implementation and acceptance results](implementation-acceptance.md) for the current deliverable. Source links below point to the reviewed commit.

**Verdict: not ready for children to complete reliably on their own. Confidence: high.**

The repository implements parts of a private student dashboard and a detailed agent operating specification. It does not yet implement a dependable, resumable setup journey from a child's first ChatGPT conversation through a populated, working private dashboard. An agent that follows every instruction literally encounters conflicts. An agent that completes setup must invent missing handoffs and recovery procedures.

The son's actual stopping point is unknown. No chat transcript, installed version from his computer, live GPT configuration, school account, or browser profile was available. The likely abandonment points below are hypotheses supported by defects, not a reconstruction of his experience.

## What was reviewed and tested

- Read the complete README and GPT specification, onboarding instructions, workspace templates, UAT notes, installers, bootstrap/recording code, updater, dashboard, API, and tests. Three independent review passes covered Windows installation, workspace/state correctness, and the child-facing journey.
- Local commit: `7e9e75559d47e3d6dcb145ec0356f48521629056`, branch `codex/guided-windows-onboarding`.
- Verified public GitHub `main`: `501ddd22889c080ac58e64bed7e68fe83c8a57f2`. Public installation therefore differs from this local branch.
- `npm test`: build succeeded and all 19 tests passed on macOS, Node v25.9.0.
- `npm run lint`: passed.
- `npx tsc --noEmit`: failed on missing `cloudflare:workers`, `Fetcher`, and `D1Database` types. The build does not establish a clean standalone TypeScript check.
- Opened the built application in an isolated local browser context. Tested date filters, setup, refresh, work-hour submission, an empty student plan, and a failed initial GET followed by a successful intercepted PUT.
- The local Node production server served the UI but could not load the Cloudflare-specific API module. Initial UI checks therefore used the device-storage fallback; the outage test intercepted API responses explicitly. This did not verify a hosted D1 connection.
- Executed disposable synthetic reproductions for seed refresh, bootstrap preparation failure, missing update tracking, the published manifest 404, runtime PATH loss, and incomplete identity inspection.
- No native Windows shell was available here. Existing Windows CI was inspected, not mistaken for a clean-machine end-to-end run. No student Site was created or deployed; no student accounts or sources were accessed.

The dashboard and API source are unchanged between public main and the local branch. Their functional defects below apply to both. The newer updater-specific defects apply to the local branch and must not be attributed to the son's older installation without evidence.

Working foundations include separate student source roots, fresh hosting manifests without the prototype project ID, empty student-specific seeds, overwrite protection, and several cross-profile rejection checks. The existing bootstrap and updater tests exercise those boundaries. The review failures concern completing and sustaining the actual student journey.

## Findings

P1 means a blocker or a correctness failure to fix before another independent child trial. P2 means a material usability, continuity, or verification gap.

### 1. P1: The public installation does not contain the latest setup improvements

The installer downloads `main.zip`, while the newer onboarding work is on a different branch. Public main lacks `reference/update-manifest.json` and `scripts/update-semester-navigator.ps1`. A synthetic workspace using the local updater against public main failed with:

```text
Public update release is incomplete or unavailable (HTTP 404)
```

That is a blocking release error, not the supported temporary-offline fallback. A newly generated local workspace with automatic updates enabled therefore cannot follow its next-chat update instruction successfully against the currently published release.

Evidence: [installer source](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/install-windows.ps1#L7), [release-error handling](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/semester-update.mjs#L209), [public branch comparison](https://github.com/cdionne7/semester-navigator/compare/501ddd22889c080ac58e64bed7e68fe83c8a57f2...7e9e75559d47e3d6dcb145ec0356f48521629056).

Required change: fix and publish a coherent release, test the exact public download, expose its installed release ID, and support upgrades from the older ZIP distribution. Merging the current branch by itself would also publish its unresolved defects.

### 2. P1: Installation can succeed while the next local process cannot run the documented commands

The Windows setup adds portable Node/npm to PATH only inside its current PowerShell process. The prescribed installer command starts a child PowerShell process, and the student is then told to open a project and continue in another chat. The next instructions use bare `npm`, although the machine deliberately has no system Node/npm.

The newer updater finds an absolute portable `node.exe`, but does not put its directory on PATH for npm's child commands. Those lifecycle scripts themselves run `npm` and `node`.

A stripped-PATH synthetic npm lifecycle reproduction, launched through absolute Node/npm paths, failed with `npm: command not found`. This was executed on macOS; the equivalent omission in the Windows wrapper is directly visible in code.

Evidence: [transient PATH setup](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/setup-windows.ps1#L86), [subsequent bootstrap instructions](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/README.md#L112), [updater launcher](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/update-semester-navigator.ps1#L36), [npm child process](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/update-semester-navigator.mjs#L49).

Required change: one verified project-runtime launcher for all subsequent operations, including nested npm commands. Test it in a completely new process after the installer exits, with no preinstalled Node/npm.

### 3. P1: Browser access is assumed before its required connection is established

The GPT requires opening the student's exact normal Edge/Chrome profile, verifying its ChatGPT identity, restarting the browser, and reading the school portal. The setup never explains installing or verifying the browser-control connection in that profile.

Current [official browser extension instructions](https://learn.chatgpt.com/docs/chrome-extension) require Settings > Computer Use, the required plugin and extension, a connected “Manage” state, and the browser profile where the extension is installed. A signed-in browser alone does not provide the agent access to it.

Evidence: [browser-readiness workflow](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L103), [school portal access](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L322).

Required change: detect the actual browser tool connection before promising portal access. Guide the student through the missing extension step once, verify a visible test page, and offer syllabus upload when browser access is unavailable.

### 4. P1: Two ordinary failures have no reliable resume path

**Canonical installation, newer local branch:** files move to the final folder before dependency installation and tests. Tracking is initialized only after those checks pass. If npm fails, rerunning the installer rejects the existing folder. The documented existing-folder setup invokes the updater, which rejects the missing tracking state. The synthetic missing-state reproduction failed before any network request.

Evidence: [move before verification](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/install-windows.ps1#L42), [update before initialization](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/setup-windows.ps1#L94), [late initialization](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/setup-windows.ps1#L123), [missing-state rejection](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/semester-update.mjs#L283).

**Student bootstrap:** the final student root is created before preparation. A simulated npm failure left the root with `provisioning_status: source_ready`, but repeating the same command failed with “studentRoot already exists.” The specification also prohibits simply reusing that root.

Evidence: [finalize root](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/student-site-bootstrap.mjs#L397), [prepare afterward](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/scripts/bootstrap-student-site.mjs#L80), [existing-root rule](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L245).

Required change: persist stages such as downloaded, dependencies pending, verified, intake confirmed, imported, provisioned, and access verified. An inspect/resume command must continue the same validated workspace after interruption. Preserve overwrite protection; do not make deleting folders the recovery mechanism.

### 5. P1: The first-use instructions contain incompatible ordering and workspace rules

The intake invokes the complete source-discovery workflow before summary approval and bootstrap. That workflow includes writing the seed and building the student's root, which does not yet exist. Root instructions prohibit connecting sources or creating student files before summary confirmation.

After bootstrap, the student must open the generated root as the primary project. Its rules restrict work to that root, but the lifecycle then requires running Site/access recorders from the canonical repository. Bootstrap deletes those recorders from the generated root.

Evidence: [intake ordering](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L91), [premature import/build steps](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L328), [approval boundary](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/AGENTS.md#L16), [canonical recording requirement](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L253), [recorder removal](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/student-site-bootstrap.mjs#L245), [student-only boundary](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/agents-template.md#L38).

Required change: separate source identification from approved source reading/import. Ship student-scoped verification and recording commands in the generated root. Completing setup should not require an agent to invent an exception to its own instructions.

### 6. P1: The dashboard's setup and planning controls do not complete the advertised work

Browser testing confirmed:

- “Set up Semester Navigator” exposes only name, school, and light/dark theme.
- The empty list says to add work during refresh review, but that dialog has no upload, add-assignment, source connection, or ChatGPT handoff.
- “Finish review” changes `refreshedAt` to “Just now” without checking a source.
- “Save and suggest blocks” saves a text work-hours field and closes the dialog. It produces no proposed study blocks.

The source workflow can be performed externally by an agent, but the Site has no implemented bridge to that workflow and always says no accounts are connected. These are unfinished product paths, not merely missing account credentials.

Evidence: [handlers](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L88), [empty-list instruction](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L118), [three dialogs](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L124).

Required change: implement a task-completing import/add-work path and actual block proposal, or give a working, explicit handoff to the student's persistent ChatGPT task. Label controls by what they currently do.

### 7. P1: Imported course updates disappear after the dashboard's first visit

The prescribed refresh edits `app/student-seed.json` and redeploys. GET `/api/plan` always prefers an existing D1 row. The client automatically saves its initial plan, even when it is the empty bootstrap seed.

Reproduction using the actual transpiled route with an in-memory database:

1. Load the empty student seed.
2. Save it, as the browser automatically does.
3. Change the seed to include one course and one assignment.
4. Reload the route with the revised seed.
5. GET still returns zero courses and zero tasks.

Evidence: [prescribed seed refresh](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L328), [existing D1 wins](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/api/plan/route.ts#L95), [automatic initial save](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L62).

Required change: an explicit import/update operation into durable storage, using stable source IDs and preserving completion status. Source updates should change data without rebuilding and deploying application code.

### 8. P1: A temporary load failure can replace the saved semester with an empty plan

The client catches a failed GET, falls back to local storage or the seed, sets `ready=true`, and PUTs that entire fallback plan 250 milliseconds later without a user edit. The API replaces the whole saved payload without a revision check.

In an isolated browser test, GET was deliberately made to fail and subsequent PUT was intercepted as successful. Without clicking anything, the client sent an empty synthetic student plan. This proves the erroneous write behavior. Combined with the route's unconditional replacement, the same sequence can erase a populated server plan when storage recovers. No real student database was altered.

Offline changes have the opposite problem: the next healthy GET unconditionally takes the server copy without reconciling pending local changes.

Evidence: [failed-load fallback](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L48), [save effect](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L62), [whole-plan replacement](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/api/plan/route.ts#L118).

Required change: distinguish verified loaded state, read-only fallback, and unsaved user changes. Do not autosave merely because loading ended. Add revision/conflict handling and a tested recovery path.

### 9. P1: The date views do not track actual deadlines

Tasks contain a free-text `when` field rather than a due timestamp and timezone. Views compare that string to “Today,” “Tomorrow,” and “This week.” Tomorrow does not become today as time passes. An imported ISO date is accepted as text but is absent from the corresponding date views.

The browser's “This week” view excluded the sample “Build the essay outline” task because it was labeled “Tomorrow.” The header also remains “MONDAY, AUGUST 17 · 8:05 AM,” and the main suggested effort is always 45 minutes.

Evidence: [Task model](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L12), [literal-string filter](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L83), [fixed date](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L104), [fixed effort](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L112).

Required change: store actual due dates/times with explicit unknown-date handling and the student's timezone. Derive rolling windows, overdue state, sorting, and effort from current data. Test midnight, week boundaries, timezone differences, and an unknown due date.

### 10. P2: An unconfigured dashboard claims that the student is on track

With zero courses and zero assignments, the browser displayed “You are clear,” “Everything on your current list is done,” and “Your courses are on track.” Missing information and completed work are being treated as the same state.

Evidence: [empty-plan success claims](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L112), [zero-course health calculation](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/app/page.tsx#L85).

Required sentence-level rewrite: “Your courses have not been added yet. Upload one syllabus or open your school portal to start.” Only show an all-clear state after required sources have been checked and coverage is known.

### 11. P2: Restarting setup loses the operational playbook and completed intake

The generated root excludes the reference directory containing the full GPT workflow. Its short AGENTS bridge provides boundaries but no complete setup/import/resume procedure. The bootstrap leaves source/account/course tables and continuity fields as placeholders; it does not generate the Semester Master Tracker or persist all answers already collected during intake.

The specification then asks the student to paste, upload, or link the tracker at the start of a new chat, conflicting with its own instruction to recover available workspace state first.

Evidence: [copied source list](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/student-site-bootstrap.mjs#L28), [unfinished continuity fields](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/chatgpt-template.md#L124), [manual tracker transfer](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L352).

Required change: persist confirmed intake and the exact next unfinished step, generate the actual tracker, and include a compact operational playbook. A new task should read that state before asking the child to repeat anything.

### 12. P2: Prerequisites and optional choices delay the first useful result

The first prompt assumes a “new Codex chat” before explaining how a child starting in a normal web GPT reaches local execution. The current ChatGPT desktop app does include Codex; Ctrl+O is valid. The defect is the missing capability/mode check, not an incorrect assumption that these must be separate installed apps. [Official Windows documentation](https://learn.chatgpt.com/docs/windows/windows-app).

The documented path includes installation and tests, machine and account choices, browser profiles and restart verification, roots, email-storage consent, updates, multiple optional sources, reminders, study difficulties, and appearance before showing a populated plan. “Do not skip steps” encourages the agent to complete this entire interview.

Sites availability is checked explicitly only later in the Site lifecycle. Current Sites access depends on plan and account limits. The installed Sites hosting workflow also uses Git and a Bash packaging helper; the installer provisions Node/npm only. Git-free template installation is supported, but completion of that local publishing workflow on a machine without those tools is not established. [Official Sites documentation](https://learn.chatgpt.com/docs/sites).

Evidence: [initial handoff](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/windows-codex-bootstrap.md#L4), [mandatory intake](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L79), [late capability check](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L251), [appearance before first value](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L336).

Required change: check the actual runtime, Sites availability, and required tooling first. Offer a useful syllabus-to-plan path immediately when local hosting setup is unavailable. Defer appearance, passkeys, reminders, email, transcripts, and additional storage until there is one real deadline and one next action.

### 13. P2: Identity checks and school customization do not fully match the promised behavior

A synthetic student root with a different `student-seed.json.profileId` and inconsistent `machine.browser_profile` still passed Site inspection/recording. Inspection compares selected profile/Site/hosting fields, but not the actual application seed or every duplicated identity field.

Evidence: [inspection inputs](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/student-site-state.mjs#L64).

Separately, the required school look includes colors/logo but the plan model has no such configuration. Implementing it in application/CSS code changes files managed by the updater, which then stops on the next hash check. Preserve that overwrite protection, but put personalization in protected student configuration.

Evidence: [school-look requirement](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-gpt.md#L336), [managed-file conflict](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/lib/semester-update.mjs#L251).

Required change: validate the deployed seed against the recorded student and consolidate duplicated identity fields. Add explicit, update-safe school presentation configuration.

### 14. P2: Passing tests currently overstate self-service readiness

The test named “rendered-html” reads TSX source and matches strings. It does not render a browser, click a button, save a plan, import an assignment, or recover from an error. Many GPT and Windows tests similarly match instruction text.

Windows CI runs `setup-windows.ps1` inside a Git checkout, which skips ZIP update behavior, and keeps its temporary PATH changes in the same PowerShell session. It does not exercise the public installer through a new-process handoff, failed-install retry, or Site deployment. Its [successful run](https://github.com/cdionne7/semester-navigator/actions/runs/32737371926) is useful but narrower evidence.

The UAT document's “Core workflow passed” concerns conversational planning scenarios. Its later setup/browser/isolation cases are listed as required results, not documented successful runs. The live GPT configuration also has no recorded version/hash or URL in the roster, so the repository cannot establish which instructions the son's GPT used.

Evidence: [source-text UI test](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/tests/rendered-html.test.mjs#L5), [Windows assertions](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/tests/windows-onboarding.test.mjs#L25), [CI scope](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/.github/workflows/windows-portable-install.yml#L31), [UAT claims and required cases](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-uat.md#L5), [live-builder caveat](https://github.com/cdionne7/semester-navigator/blob/7e9e75559d47e3d6dcb145ec0356f48521629056/reference/semester-navigator-uat.md#L56).

Required change: retain meaningful unit tests, but make readiness depend on successful user journeys and error recovery using the released artifact.

## Likely abandonment points

| What the child does | What can happen | Evidence level |
|---|---|---|
| Opens a custom GPT and says “Set up my semester” | Gets a local-install handoff without a verified executable environment | Documented gap; son's experience unknown |
| Finishes the installer and opens a new project | Bare npm is unavailable in the fresh process | Code evidence plus stripped-PATH reproduction |
| Opens the school portal in Edge | Agent cannot control that profile because the extension is missing | Missing prerequisite confirmed against official docs |
| A download or dependency install fails | Repeated setup rejects the existing folder or missing tracking | Synthetic reproductions; updater case is newer branch only |
| Closes the chat halfway through | New root lacks a saved next step, populated tracker, or full workflow | Generated-file evidence |
| Opens an empty dashboard | Setup and refresh buttons cannot add courses, while dashboard reports all clear | Browser reproduced |
| Imports assignments after the first visit | Site continues returning its old saved plan | API reproduction; source shared with public main |

The existing issue-form fallback requires a GitHub web sign-in. That is a poor recovery endpoint for a child who was promised no GitHub account requirement for installation. A short local diagnostic summary and “continue my setup” action would be more usable.

## The simpler self-service contract

The first useful outcome should be a verified deadline and a concrete action, not a successfully installed development project.

1. One student entry point checks whether it can execute locally and whether optional hosting/browser capabilities exist.
2. Ask only the identity, school/term, and required eligibility facts that cannot be detected. State the actual eligibility requirement plainly rather than asking whether an unexplained minimum is met.
3. Accept one syllabus or one approved portal session. Show extracted courses and real due dates, clearly marking unknowns.
4. Confirm one compact setup summary.
5. Persist complete intake and resume state; create, populate, and verify the private workspace/Site within one consistent project boundary.
6. Show the working dashboard and “Start here.” Offer extra sources and appearance afterward.
7. Every interrupted step resumes from a durable checkpoint using the same student and Site.

For children starting in browser-only ChatGPT, a syllabus-to-plan path can deliver immediate value while any local setup remains optional or deferred. The current specification unnecessarily makes installation a gate to that first benefit.

The load-bearing changes are real deadline data, a functioning import path, durable-state correctness, a resumable setup state machine, capability checks, and a verified public release. School branding and additional connections can wait.

## Acceptance evidence required before another independent trial

| Scenario | Pass condition |
|---|---|
| Fresh Windows account, no Git/Node/npm, normal permissions | Exact public entry point reaches verified first value; required local capabilities are checked before the interview |
| Installer exits, then a new local task starts | All commands locate the portable runtime without machine-wide PATH changes |
| Network fails during source/dependency installation | “Continue setup” resumes the same validated installation |
| Child closes the chat at each major step | Next task resumes without losing confirmed answers or recreating roots/Sites |
| Browser is signed in but extension absent | Setup detects the missing connection and gives one actionable step or upload fallback |
| Sites unavailable or over quota | This is detected early; the student receives a usable planning fallback |
| One syllabus imported | Course and exact known deadline appear; missing dates stay unknown |
| Empty dashboard opened, then first import runs | Imported data appears in durable storage without wiping any existing edits |
| Initial GET fails, then storage recovers | No automatic destructive PUT occurs |
| Offline edit or concurrent second device | Pending changes survive or a clear conflict is presented |
| Midnight/week boundary passes | Today/tomorrow/week views update correctly in the student's timezone |
| Student refreshes a source | New/changed records merge while completed work remains completed |
| Private Site is opened from intended normal browser profile | Access and the intended account are verified |
| Second student's setup runs | Separate roots/Sites/storage remain isolated and seed/profile mismatches are rejected |
| Child returns next day | One current task is visible without re-uploading an already accessible tracker |

A release is ready when a child can complete this without a parent repairing commands, files, project selection, or inconsistent state. The present passing build and prose tests do not meet that bar.
