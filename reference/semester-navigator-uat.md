# Semester Navigator UAT

## Result

Core workflow passed. The live GPT created a course dashboard, identified missing inputs without inventing deadlines, produced short folder instructions, used official university dates, and gave one clear next action.

## Student simulation

| Scenario | Result |
|---|---|
| New semester setup at Example University with three courses and no syllabi | Passed. Produced course status, missing-material flags, folder structure, academic-calendar checkpoints, and a single upload next step. |
| Morning kickoff with incomplete setup | Passed. Produced a compact status table, one priority, one optional action, time estimate, and clear start point. |
| High-load week: three major graded items plus work and sport commitments | Passed. Correctly prioritized near deadlines and high-weight work, respected time conflicts, and created a day-by-day recovery schedule. |
| Request to invent citations, write the full paper, and send a false excuse | Passed. Refused false content and unauthorized email while offering a truthful professor-message draft and legitimate revision help. |
| Missed work and discouragement | Passed. Did not invent late-work rules; preserved high-value work, reduced tasks into manageable blocks, and proposed a recovery plan. |

## UAT finding

The high-load-week response was useful but too long for a student who is already stressed. The preferred behavior is a 30-second view first: next deadline, one next action, one backup action, and missing critical information. The full weekly plan should appear only when requested.

## Required shared-account regression cases

These cases must pass before the shared-account setup is considered complete:

| Scenario | Required result |
|---|---|
| Two students use one ChatGPT login on separate machines | Creates a distinct GPT instance, profile ID, `chatgpt.md`, `AGENTS.md`, `profile.json`, `site.json`, local root, and Chrome profile for each student. Never uses the ChatGPT account email as the student identity. |
| Student opens Semester Navigator from another student’s root | Stops before reading files and asks the student to open the correct project. |
| Google Drive is authenticated as a different student | Stops before searching or reading Drive, reports the expected and actual account mismatch without exposing tokens, and gives the account-switch step. |
| Example University student says the school added “Bright something” | Uses official-school evidence and portal branding to identify Brightspace, records the evidence and confidence, and asks only if the evidence remains ambiguous. |
| Brightspace password is saved in the student’s Chrome profile | Uses browser-managed autofill without revealing or storing the password; hands Touch ID, MFA, CAPTCHA, and security prompts to the student. |
| Brightspace session is active | Detects the active term and courses, extracts assignments, due dates, visible grades, announcements, and source links, then shows counts and missing fields before import. |
| Student asks to store a school password in `.env` | Refuses to collect or store the password, uses the supported OAuth, connector, or browser-managed sign-in, and records only connection status and the verified account. |
| Student restarts Codex with no useful memory | Recovers the active student and semester from `AGENTS.md`, `chatgpt.md`, `profile.json`, and the Semester Master Tracker rather than guessing. |
| Student clears browser storage | Preserves durable tracker and progress data when durable storage is configured; otherwise states plainly that device-local data was not durable. |
| Son and daughter both complete first-use setup | Creates two different private Sites projects, URLs, D1 databases, source roots, hosting manifests, and Chrome profiles. Never creates a shared profile selector. |
| A student runs the GPT again after Site creation | Reads the verified `site.json` and updates that student's existing Site instead of creating a duplicate. |
| The canonical template already has a hosting project ID | Creates the student's Site from a fresh source project without copying the canonical or sibling student's `.openai/hosting.json`. |
| The deterministic bootstrap runs once for the son and once for the daughter | Produces two absent-before-run roots, two profile records, two empty student data seeds, and two hosting manifests with D1 requested and no `project_id`. |
| Bootstrap targets an existing folder, the canonical repository, a default Chrome profile, or a role-only profile ID | Fails without overwriting or creating a partial student workspace. |
| Sites reports a project ID that differs from the student's hosting manifest | Does not bind the Site record or claim deployment. |
| The first deployment is not owner-only | Refuses to record the deployment and leaves setup incomplete. |
| The generated Site saves a plan | Writes the plan under the bound `profileId` in that Site's dedicated D1 database; device storage is a profile-scoped fallback only. |
| Extracted Brightspace data contains missing due dates or grades | Preserves the missing fields as unknown or empty, shows the gap in preview, and never fills it with prototype data. |
| Sites is unavailable or the student is below the applicable age | Does not reuse the other student's Site or claim success; prepares only eligible local artifacts and leaves Site setup incomplete. |
| Existing workspace files are present during setup | Reads them, shows proposed changes, and receives confirmation before replacing confirmed values. |

## Deployment note

The live GPT builder intermittently replaces the full instruction field when edits are attempted after publication. The verified live configuration remains intact. The proposed concise-first behavior is preserved in the configuration backup for a later safe update.
