# Import and refresh sources

## Begin with material already available

Read the student's uploaded syllabus, rubric, prompt, calendar export, or
approved local file. Discover courses from those materials before asking for a
manual course list. For a portal, infer the product from official school pages
and visible portal evidence; ask only when the evidence is ambiguous.

Keep a source title/link, retrieval date, and verification note with each
import. Course documents and official portals establish requirements;
instructor announcements may revise them. Calendar entries and class notes
need confirmation when they conflict with those sources. Surface an actual
conflict rather than silently selecting a date.

Show a short preview: course count, new or changed assignments, nearest
deadline, and missing dates. Confirm material ambiguities before saving.
Do not rewrite already confirmed facts without authorization. Preserve stable
course/task IDs across refreshes so completion and notes survive.

## Browser connection only when needed

Inspect actual browser tools before promising access to a signed-in portal.
For regular Chrome/Edge, use the ChatGPT browser extension in the intended
profile. If it is not connected, follow current official
[browser extension setup](https://learn.chatgpt.com/docs/chrome-extension):
Settings → Computer Use → browser/plugin/extension installation → verified
Manage state. The student handles extension permission prompts and sign-in.
Use the profile where the extension is installed. Verify the school and
exposed account identity before reading coursework.

The built-in and cloud browsers have separate sessions from a normal browser.
Use them only when the task and available tools support that path. Never infer
authentication from the desktop login or a saved browser-profile name.
For a dedicated source on a shared computer, agree the correct profile before
connecting; do not require a new browser profile for every student upload.

Read course lists, assignments, due times, grades, and source links within the
approved term. Validate missing pages and duplicate records. If authentication
expires, mark the source `needs-sign-in` and preserve the last verified plan.
Do not report “no change” when the source could not be checked.

## Normalize and persist

Use the current application schema in the bundled `lib/plan-model.mjs` when
available and the dashboard's JSON import format. Each task needs a stable ID,
course linkage, title, estimated minutes, and state. `dueAt` is `null` when
unknown, `YYYY-MM-DD` for a date without a known time, or an ISO timestamp with
an explicit offset for a known time. Never infer midnight or an LMS time zone.
Preserve `sourceUrl`, `rubric`, and `notes`; retain unknown grades as unknown.

For grading components, preserve `id`, `title`, `weight`, `score`, `possible`,
and `finalized`. Every non-null score must include its actual maximum in
`possible`; use `100` only for an explicitly reported percentage. A score with
no known maximum cannot support a calculation. A current category average is not evidence that the category is
complete. `finalized` defaults to `false`; set it to `true` only when the source
confirms that the component or entire category has finished. Do not convert a
partial Labs or Homework average into fully earned course weight. Assignment
rubric points are not overall course grading weights.

Sources distinguish manual material, connected sources, unconnected sources,
and expired sessions. Set `lastChecked` and `verified` only after a real read.
An uploaded syllabus is a manual source, not a live LMS connection.

Initial setup saves the approved plan through `--intake-file`. For a later
explicit import, GET `/api/plan` for `{plan, revision}`, normalize the incoming
data with `normalizePlan(raw, expectedProfileId)`, and merge it using
`mergeImportedPlan(current, incoming)` from `lib/plan-model.mjs`. PUT
`{plan: merged, baseRevision: revision}` to `/api/plan`, retaining the returned
plan's revision and seed revision. A 409 requires reloading and reviewing the
conflict, not blindly retrying or overwriting the newer plan.

An explicit source import adds confirmed facts. Omitted or blank course/task
metadata, unknown deadlines, and empty resource/grading lists do not erase
previously saved facts. Resources and grading components merge by stable ID;
an absent/null score does not clear an earned score or its denominator. Keep
the student's current fields when preparing a full normalized JSON artifact,
including grading denominators and finalization flags. To remove a known fact,
review that correction and use the dashboard editor or a direct revision-checked
API edit. A partial source import is not a clearing operation.
An existing high task priority also survives a partial import's default normal
priority; lower it through a reviewed direct edit when appropriate.

A changed validated seed is reconciled on the next GET against the stored seed
baseline, preserving local edits. If updating a seed file, write complete
normalized JSON to a sibling temporary file and rename it atomically. Prefer
the API import for changes the student just reviewed against the current plan.
Verify that reconciliation actually happened;
do not treat a deployment result as proof of the saved plan's contents. Do not
edit `.semester-navigator/plan.json` directly while its server is running.
Verify the source summary, changed task, and preserved completion state after
saving.

For a refresh, report only sources actually checked: confirmed changes, facts
needing confirmation, and sources with no change. Include blocked sources
plainly. Opening the dashboard itself does not run a portal refresh.
