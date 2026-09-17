# Desktop chat and phone continuity

Establish the student's authoritative plan before choosing a continuation path.
For phone use with the computer off, a cloud request, or callable cloud plan
tools, follow [cloud](cloud.md): list and load the explicitly selected profile
before looking for local files. Verify the actual account, student, and term.
People using a shared ChatGPT account can access its student plans; separate
profiles prevent accidental mixing and do not create privacy between them.

Use the local sections below only for an explicitly local workspace. Remote
remains optional when the student wants to operate that computer.

## Cloud: the same plan on phone and desktop

Use the selected cloud plan's actual `dashboardUrl` and revision from the
authenticated tools, or verify it in ChatGPT Work's authenticated cloud browser.
The computer is not part of this storage path. A fresh chat must load that plan
again; conversation memory and a copied request are not the current record.
After a change, read it back and confirm it in the dashboard. See
[cloud](cloud.md) for the acceptance candidate, actual connection checks, browser
fallback, school sign-in, and recovery. Do not claim plugin directory or mobile
installation availability that has not been observed.

## Desktop: dashboard beside the chat

Open this student's actual dashboard URL beside their chat, using the app's
browser panel when available. Verify the chat's active folder against
`profile.json.approved_local_root` and its student/term. Help the student keep
that project or chat easy to find. Select Astra in the model picker when the
student requests it and it is available; do not change account-wide defaults
for other shared-account users.

The local dashboard's **Open desktop chat** action uses the documented
`codex://new?path=...&prompt=...` link. The running student server supplies its
verified physical folder and profile ID through `/api/runtime`. The link opens
a new local chat in that folder with a short Semester Navigator request in the
composer. It does not send the request, select a model, or continue a specific
existing conversation. The student reviews it and presses Send. The new chat
reads current saved coursework and the bundled playbook; the URL contains
stable selection IDs rather than the whole rubric, notes or gradebook.

If the app asks to open the external link, let the student complete that prompt.
If routing is unavailable, use **Copy request**, open the student's existing
project/chat, and paste it. Never substitute a generic ChatGPT homepage and
claim the correct project was selected. Do not manufacture a project ID,
conversation ID, host ID or undocumented model query parameter.

An already-open dashboard checks for newer saved revisions when it gains focus
and periodically while visible. Pending or conflicted edits are retained for
review instead of overwritten. The assistant must still save through the
current revision-checked plan API and read back the result. This refresh is
between the dashboard and its own server; it is not school-source refresh or
local-to-cloud synchronization.

## Optional Remote: continue an explicitly local desktop workspace

When the student chooses to continue their local workspace from a phone, check
current app availability before claiming it is configured. ChatGPT mobile
**Remote** uses that desktop host's projects, chats, files, plugins, school
sign-ins and permissions. It does not meet a computer-off requirement.

1. In the student's desktop app, open **Settings → Connections → Control this
   Mac or PC**, then **Set up** or **Add**.
2. The student completes verification and scans the displayed QR code with
   their phone. Use the same ChatGPT account and workspace on both devices.
3. On the phone, open **Remote**, choose the correct computer, and open that
   student's Semester Navigator project/chat. Verify the active student and
   term before using school sources or saving changes.
4. Test a real exchange from the phone, then a small student-approved plan edit
   and desktop readback. Record only what was actually observed. Creating a
   link or describing pairing is not proof of a successful phone connection.

The computer must remain awake, online, and running the desktop app. Sleep,
closing the app, or loss of connectivity interrupts access. Windows Computer
Use also needs the host session unlocked and uses its foreground desktop.
Explain these requirements before calling this a phone-ready setup. Do not
open the loopback dashboard port to the network; its address is local to the
computer. Remote sends chat and approvals to that computer, not a phone-local
copy of the dashboard.

## Phone use while the computer is unavailable

Follow [cloud](cloud.md) without repeating an already stated computer-off
requirement. Use the existing cloud profile through callable tools or the
authenticated cloud dashboard. A local repository plugin does not establish
that connection. If access is unavailable, state the actual gap and preserve
the same plan rather than creating a competing copy.

The local file store and hosted store remain separate. Matching profile IDs
do not synchronize them. A migration requires the actual local saved work,
student authorization, a cloud import, and verified readback. A cloud browser
cannot inherit the desktop's school session; verify its separate sign-in.

Verified documentation, September 17, 2026:

- [Desktop chat links and parameters](https://learn.chatgpt.com/docs/reference/commands#deep-links)
- [Remote setup and host requirements](https://learn.chatgpt.com/docs/remote-connections)
- [Local and cloud work](https://learn.chatgpt.com/docs/use-chatgpt#choose-cloud-or-local-work)
- [Model selection](https://learn.chatgpt.com/docs/models)
