# Connected school setup acceptance

Review date: 2026-09-09. This review replaces the upload-first desktop acceptance
criterion used for v0.2.0-beta.1. That release demonstrated local setup and saved
planning, but did not meet the requirement for a student-led school connection.
The web starter retains its optional upload path.

## Required student experience

A student opens the public repository or the matching release in ChatGPT
desktop and asks to set up Semester Navigator. ChatGPT discovers the school and
learning tools through focused questions and official/visible source evidence.
It guides the actual connector or browser setup, waits for the student to
complete protected sign-in, verifies the exposed school identity, and checks
the current-term roster and per-class coursework. The student does not need to
know an LMS product name, create an API application, prepare a course list,
upload a syllabus, install developer tools, or ask a parent to configure it.

Course coverage and a working connection are separate records. Partial access
and setup interruptions retain the saved work and the next step. A later source
check uses real available tools. Loading the dashboard is not a source refresh.

## Review loops

1. Entry and conversation review found upload-first prompts in the README,
   installed skill metadata, Windows guide, legacy GPT continuation, dashboard
   welcome screen and coaching handoffs. These routes now guide school
   connections. The release remains self-contained, with a web-only starter.
2. Data and recovery review found that a successful connection could obscure an
   incompletely traversed class roster, and that reauthentication could make
   old scope checks appear current. The source model now records roster and
   per-course coverage independently and requires evidence for checked states.
   Regression tests cover partial roster traversal and reconnection.
3. Import review found that a partial or legacy source import could replace
   saved connection details with normalization defaults. Source imports retain
   existing progress and merge coverage by stable course/scope identity.
4. A fresh resumed high-school conversation correctly preserved its saved plan
   but asked the student to transcribe account details when Edge was not
   callable. The source playbook now gives the exact saved project, browser
   selection and resume prompt. Repeating the same conversation passed without
   asking for an upload, transcription or repeated intake.

## Final local checks

| Check | Result |
|---|---|
| Production builds, self-contained bundle and Node tests | `npm test`: 86 passed, one native-Windows-only skip on macOS. |
| Complete Chromium suite | 14 passed, including three new connected-source journeys. |
| Model regressions | 26 passed, including independently repeated serialized-import and stale-export failures. |
| Types, lint, dependency audit | TypeScript and ESLint passed; npm audit reported zero vulnerabilities. |
| Detached ZIP | The actual packaged ZIP bootstrapped independent college and high-school roots, then each ran after removal of the source bundle. |
| Fresh conversational checks | College opening, high-school opening, and corrected high-school interrupted resume passed. |
| Visual inspection | Sources panel inspected at desktop and 390px widths; no horizontal overflow. |
| Existing 0.2 student upgrade | Actual old ZIP bootstrap/server/updater updated 25 managed files to `2026.09.09.1`; private profile, plan, seed and context stayed byte-for-byte intact. New API saved source coverage at revision 2 and retained it plus completed work/notes after server restart. Update integrity and runtime readiness passed. Local frozen update transport, no real school account. |
| Exact-release update routing | Actual CLI HTTP test confirmed `--raw-root` selects the requested release and preserves private context. |

## Evidence scope

The synthetic school portal exercises actual Chromium page reads, source
recorders, local HTTP persistence, and the shipped dashboard. It includes a
protected login gate, wrong school identity, an initially unidentified portal,
paginated classes and assignments, unavailable grades, and expired access.
It never accepts passwords and does not implement Google or D2L OAuth. Its
deterministic test client is not evidence of autonomous LLM portal traversal.

Separate fresh Codex executions test conversational behavior with only the
maintained skill and synthetic student requests. The college opening with
“Bright something” asked for the school name and explicitly said neither a
syllabus file nor an exact product name was required. No real accounts were
read in these evaluations. The fresh high-school opening asked for school and
location without requiring prepared files. The corrected resume read the
synthetic profile, kept the completed Biology Lab and pending sign-in state,
and provided a new local Work/Codex task handoff with the saved root and `@Edge`.

Two final import defects were reproduced independently and corrected: a
serialized normalized partial source could lose existing connection facts, and
an older export could overwrite a newer access failure. Both exact
reproductions now pass. The dashboard also combines complementary coverage
across sources instead of expecting every source to supply everything.

## Limits

Live school OAuth, browser-extension installation on each child's computer,
school administrator policy, and actual coursework visibility require that
student's account and device. Those account-specific checks are part of setup;
they are not represented as having passed here. Neither school platform is
assumed from the parent's description. Actual reminder delivery and private
Sites remain separate optional acceptance checks. This plugin has not been
submitted to the universal public plugin directory.

Browser workflow reference: [official OpenAI browser extension documentation](https://learn.chatgpt.com/docs/chrome-extension).
Plugin distribution reference: [official OpenAI plugin documentation](https://learn.chatgpt.com/docs/plugins).
