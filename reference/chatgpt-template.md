# Semester Navigator Student Workspace

> Private student context. Keep this file inside the student’s approved workspace. Do not publish or commit it to a shared repository.

## Active student

- Profile ID: `[student-slug]`
- Display name: `[student name]`
- School: `[school]`
- Semester: `[semester]`
- Time zone: `[time zone]`
- ChatGPT login: `[individual or trusted shared household account]`
- Dedicated Site browser profile: `[student-specific browser profile]`
- Last verified: `[YYYY-MM-DD]`

## Computer and ChatGPT access

- Platform: `[machine platform]`
- Device arrangement: `[device mode]`
- ChatGPT desktop app: `[installed/not-installed/declined/not-supported]`
- Browser used for hosted Sites: `[site browser]`
- Browser profile: `[student-specific browser profile]`
- ChatGPT browser session: `[verified/pending browser session]`
- Session still present after browser restart: `[verified/pending session persistence]`
- Passkey status: `[enabled/not-enabled/unavailable/unknown]`
- Intended Site viewer email: `[viewer email or not stored]`

The ChatGPT desktop app and the Site browser have separate sessions. A private
Site is not ready for normal student use until the intended account works in the
exact browser profile above and the session survives a browser restart.

## Template updates

- Automatic updates: `[enabled/disabled]`
- Repository: `https://github.com/cdionne7/semester-navigator`
- Channel: `main`
- State: `.semester-navigator/update-state.json`

Automatic updates may change only template-managed application files. They must
preserve this file, the student profile, Site record, hosting project ID,
private seed, and durable Site data. A failed verified update must roll back.

## Workspace boundary

- Approved local root: `[absolute local path]`
- Approved cloud root: `[Drive, OneDrive, or none]`
- Work only inside these roots.
- Do not read, search, summarize, copy, move, or change another student’s files or sources.
- If the current working directory is outside the approved local root, stop and ask the student to open the correct project.

## Expected accounts

| Source | Expected email | Store locally approved? |
|---|---|---|
| School | `[email or not provided]` | `[yes/no]` |
| Email | `[email or not connected]` | `[yes/no]` |
| Calendar | `[email or not connected]` | `[yes/no]` |
| Drive | `[email or not connected]` | `[yes/no]` |

These addresses identify the intended account. They are not credentials. Never store passwords, recovery codes, cookies, API keys, or OAuth tokens here.

## Student Site

- Status: `[not_created/created/deployed/blocked]`
- Sites project ID: `[tool-confirmed ID or not created]`
- URL: `[tool-confirmed URL or not deployed]`
- Access: `Owner-only unless a later audience change is explicitly approved`
- Intended viewer account: `[viewer email or not stored]`
- Browser access test: `[pending/verified]`
- Durable storage: `Dedicated to this Site and student profile`
- Source root: `[absolute student Site root]`
- Hosting manifest: `[source root]/.openai/hosting.json`
- Last verified: `[YYYY-MM-DD/never]`

This student must not share a Sites project, URL, storage binding, source root, hosting manifest, or named browser profile with another student. Do not use a student selector or combined family dashboard.

## Connected sources

| Source | Expected account | Verified account | Access | Status | Last checked | Provides |
|---|---|---|---|---|---|---|
| Course portal | `[email]` | `[email/unverified]` | `[read-only/approved writes]` | `[Brightspace/Canvas/other; connected/not connected/blocked]` | `[date/never]` | `[courses, assignments, due dates, grades, announcements]` |
| School email | `[email]` | `[email/unverified]` | `Read-only by default` | `[status]` | `[date/never]` | `Instructor announcements` |
| Calendar | `[email]` | `[email/unverified]` | `Read-only until an event is approved` | `[status]` | `[date/never]` | `Classes, commitments, open time` |
| Course folder | `[email or local]` | `[email/local/unverified]` | `[read-only/approved writes]` | `[status]` | `[date/never]` | `Syllabi, rubrics, assignments, drafts` |

## Source priority

1. Official course portal or syllabus
2. Instructor announcement
3. Calendar
4. Approved course files
5. Approved transcript or recording

Do not promote a lower-priority source over a conflicting higher-priority source without student confirmation.

## Courses

| Course | Instructor | Meetings | Source locations | Next known deadline | Missing Essentials |
|---|---|---|---|---|---|
| `[course]` | `[instructor]` | `[times]` | `[links/paths]` | `[date or unknown]` | `[items]` |

## Approval boundaries

- Read-only without a new confirmation: `[approved sources and scopes]`
- Confirm before: external writes, calendar changes, messages, submissions, moving files, or revising confirmed tracker facts.
- Unavailable or blocked: `[sources/actions]`
- Never permitted: requesting or storing passwords, recovery codes, session cookies, API keys, or OAuth tokens.
- Assistance rule: Codex performs available technical setup, update, verification, and file work. The student handles only protected sign-in steps and choices Codex cannot safely determine.

## Operating rules

1. Confirm the active student, semester, and approved root before the first file-changing or external action.
2. Verify the authenticated account against the expected email before using an external source.
3. Stop on a student, path, or account mismatch. Give the shortest correction step.
4. Do not claim a source is connected until the connection has been verified.
5. Do not use another student’s files, memory, connected account, browser session, tracker, or Site profile.
6. Do not create, update, or deploy from another student’s Site project, source root, hosting manifest, or storage.
7. Edge or Chrome may use browser-managed autofill, but never reveal, read, copy, paste, or store a saved password. Hand sign-in, MFA, CAPTCHA, Windows Hello, passkeys, Touch ID, and security prompts to the student.
8. Ask before external writes or changes to confirmed facts.
9. Keep private student Sites owner-only or selected-user only. Verify the intended account in the recorded browser profile after every access change.

## Continuity

- Semester Master Tracker: `[path or link]`
- Student Site record: `.semester-navigator/site.json`
- Setup status: `[complete/incomplete]`
- Missing setup items: `[items]`
- Do this next: `[one action]`
