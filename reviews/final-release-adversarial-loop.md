# Final release adversarial loop

Date: 2026-09-08. Three novel probes used synthetic student data and the actual
`plugins/semester-navigator/template` model, server, and prebuilt dashboard.
The browser probes ran in a temporary generated root on loopback with headless
Chromium. No real accounts, coursework, reminders, or hosted Sites were used.

## 1. Partial syllabus refresh erased known course facts

Before the fix, the documented `normalizePlan(raw)` followed by
`mergeImportedPlan(current, incoming)` lost an existing reported grade `88%`,
goal `90`, tutoring resource, and grading components when a valid incoming
course supplied only its stable ID and name. A matching assignment's revised
deadline imported correctly, and its completion/notes survived, making the
unrelated course loss easy to miss in the assignment-focused preview.

The corrected explicit import preserves known facts when extracted fields are
omitted, blank, or unknown, and merges resources/components by stable ID.
Unknown minutes and dates cannot erase known values. Omission information stays
available across in-memory normalization without introducing saved JSON fields.
Null component scores do not erase earned scores or their denominators.
Reviewed direct edits remain able to clear an incorrect value. Baseline seed
reconciliation retains its existing three-way source-change behavior.

Evidence: `lib/plan-model.mjs` at `mergeImportedPlan`, and the regression tests
“a normalized partial source refresh preserves known course and assignment
facts through save and reload” and “partial nested source records merge by ID
without erasing denominators, scores, resources, or omitted finalization” in
`tests/plan-model.test.mjs`. The first includes normalized JSON serialization,
actual service save/readback, and deliberate direct clearing of a deadline.

Validation after this fix: all 24 model, local HTTP, and hosted-route tests
passed. Scoped ESLint passed. A rebuilt dashboard/plugin is required to carry
this corrected model into distribution.

## 2. Editing notes changed or blocked an already confirmed timestamp

An imported deadline `2026-11-01T01:30:00-05:00` is unambiguous because its
offset is supplied. In the release browser, editing only the assignment notes
failed with a clock-change ambiguity message. The editor reconstructed a
minute-resolution local time even though the student had not changed it.

For `2026-09-11T19:00:30.123Z`, the same note-only edit succeeded but silently
saved `2026-09-11T19:00:00.000Z`, dropping the confirmed seconds/milliseconds.

The root agent corrected `app/page.tsx` at `saveTask` to preserve the existing
`dueAt` when both date/time editor fields match their original displayed values.
Newly entered or changed times still use clock-change validation. This review
confirmed the code change; root owns the rebuilt browser regression run.

## 3. Server commit succeeded but its response was lost

The browser PUT reached the real local server and committed revision 3, then
the test aborted the response before the browser received it. The browser kept
the pending edit. After reopening it displayed a revision conflict instead of
blindly writing again. Its exported copy contained the pending availability
note. Explicitly loading the latest saved plan restored the same note from the
server, still at revision 3. Exactly one PUT occurred. No data was lost or
duplicated in this probe.

Raw browser evidence remains at
`/var/folders/ms/673yqg_563vgn7dfzk181zwr0000gn/T/semester-final-probes-Z3hil5/probe-result.json`.

## Acceptance limits

Confidence is high for these deterministic reproductions and the tested
model/API fix. This bounded loop does not establish real Windows installation,
school portal access, account eligibility/session continuity, scheduled-task
delivery, calendar import alerts, or owner-only Sites access. Those require the
corresponding real environment and tool-confirmed outcomes. No such success is
claimed here. The final rebuilt distribution and browser regression results
must be taken from the root release verification after these fixes.
