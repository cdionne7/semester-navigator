# Independent high-school web forward loop

Completed September 8, 2026 using synthetic student/course material. This was an attachment-only ChatGPT web simulation on a Chromebook, with no access to the student's machine, browser accounts, hosted Sites, or scheduling tools. It did not use the implementation's expected outcomes to construct the student response.

## Inputs and guidance actually read

- Synthetic student request: Avery Chen, grade 10, Fall 2026, New York; 25 minutes available before soccer; no installation or account connections; explicit permission to save supported facts; a requested weekday 7 PM reminder; one opening sentence for rubric feedback.
- Supplied English 10 material: reading response due September 11 at 3 PM; proposal due September 18 without a time; an undated “next Friday” book-presentation announcement; no story text, grades, or course grading weights.
- The current plugin SKILL.md and its web, sources, coaching, and reminders references; README.md; reference/web-starter.md.

No extra intake questions or repeated save-permission requests were needed. The student's instruction to save supported facts and mark ambiguity authorized the first artifacts. The missing story did not prevent limited feedback on the opening sentence.

## Actual student-facing result

The response led with the September 11, 3 PM EDT deadline and a proposed 25-minute first session. It previewed three assignments, then linked a readable tracker, a bare importable Plan JSON file, and an optional calendar reminder export. It explicitly left the reminder unscheduled.

The tracker preserved:

- One course, English 10 with Ms. Rivera, and the supplied meeting times.
- The reading response's known date and time, 250–350-word requirement, one-character focus, source-evidence requirement, submission method, and 4/4/2 rubric.
- September 18 as a date-only deadline, with no invented midnight deadline.
- The book presentation as an unknown date, keeping the original “next Friday” wording and missing posting date.
- Unknown grades, total remaining effort, and course grading weights.

Writing feedback connected each supplied rubric criterion to the actual opening sentence. It replaced the vague “people” claim with an explicitly unfinished sentence frame for one character. It did not invent a character, interpretation, story quotation, predicted grade, or unwritten response.

The weekday 7 PM request became a disabled `plan-only` reminder record with no provider/tool ID. The optional `.ics` file was created, but neither imported nor presented as an active notification. No installation, account connection, portal read, or hosted deployment was claimed.

## Artifacts and execution evidence

Actual files were created in:

`/var/folders/ms/673yqg_563vgn7dfzk181zwr0000gn/T/semester-high-school-forward-i40r_ut7/outputs/`

- `student-response.md`
- `semester-tracker.md`
- `semester-plan.json`
- `reminder-plan.ics`
- `forward-review-report.json`
- `reviewer-model-readback.json`
- `reviewer-model-validation.json`

The first four files are the actual student deliverables, not mock file names. The final two are a separate evaluator run, not actions claimed to have occurred on the Chromebook.

The evaluator normalized the original generated artifact, merged it into an isolated empty student plan, saved it through the actual revision-checked plan service, and read it back. Final result: revision 1, one course, three tasks, one unknown deadline, a disabled plan-only reminder, and idempotent normalization. Persistence used an isolated in-memory adapter; no real student workspace or server was involved.

## Defect found and repaired during the loop

The independently generated source retrieval timestamp used Python's normal six-digit fractional seconds. The web starter correctly permits an ISO timestamp, but the model initially accepted only one to three fractional digits. The original artifact failed `normalizePlan` before import.

The model now accepts up to nine fractional digits and canonicalizes timestamps to JavaScript's millisecond ISO representation. A regression test covers microsecond source timestamps, nanosecond assignment timestamps, normalization idempotence, and revision-checked import/readback. The original artifact was retained unchanged; rerunning it after the fix passed.

## Limits of this evidence

This verifies the current instructions can produce useful, supported downloadable artifacts without installing software or connecting accounts. It does not prove a real Chromebook reminder fires, a live school portal works, or a web-hosted Site is available. Those capabilities were absent and were represented as unavailable, while the student still received the requested plan and limited writing help.
