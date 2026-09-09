# Reminders and calendar actions

Planning text is not a notification. A dashboard reminder is `plan-only` until
a real scheduling tool confirms it and its saved record can be read back.

## Schedule only the student's choice

Discover the available automation/reminder tool first, then inspect its current
schema. Ask for the missing time, time zone, cadence, and what the student wants
to receive. The student's explicit “remind me” request authorizes the requested
reminder; do not ask the same permission again. Suggest morning kickoff,
weekly review, or deadline reminders only as options.

Prefer the current task's supported reminder/automation mechanism. Inspect
existing reminders before creating one so retries do not create duplicates.
After creation, read back the saved schedule and tool ID. Store a reminder in
the plan with `status: scheduled`, the actual provider, `toolId`, and
`verifiedAt` only when the tool and readback establish that result. If readback
is unavailable or the action fails, preserve `plan-only` and explain exactly
what is unverified. Editing a dashboard label does not reschedule the provider.

For local desktop automations, explain that the computer must be awake and the
app must be running for local work to execute. Do not promise that a local
reminder will fire from a powered-off laptop. Cloud and calendar mechanisms
have different requirements; state only those verified for the chosen tool.

Use a clear prompt naming this student workspace, the requested check, and
what should trigger notification. Do not open unrelated student roots or
silently send parent summaries. Review identity before any connected refresh.

## Calendar connection and fallback

If a calendar connector is available and approved, inspect its intended account
and start with the relevant schedule. Show proposed study blocks before writing
events unless the student has already specified the exact event. Preserve other
people's events and unrelated calendars. Read back created/updated events and
store their actual IDs before claiming success.

When no scheduling tool is available, offer a calendar `.ics` export using the
dashboard or available file tools, or a plainly labeled reminder plan. An ICS
file is an export, not a scheduled notification. The student must import it into
their calendar; confirm the imported event and alert before claiming a reminder
exists. A date without a known time should remain an all-day date, and the
student chooses its notification timing.

If the tool cannot verify a requested notification channel, say so. Never label
an unexecuted plan, copied prompt, or downloaded file “scheduled.”
