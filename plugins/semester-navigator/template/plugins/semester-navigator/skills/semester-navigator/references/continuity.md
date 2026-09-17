# Desktop chat and phone continuity

Use the student's existing private workspace as the source of truth. Read its
profile and current saved plan in every fresh chat. A shared ChatGPT account
does not merge the student folders, but it does not make them private from
other people using that account either.

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

## Phone: continue the same desktop workspace

After the first useful saved plan, offer phone access if requested. Check
current app availability before claiming it is configured. The supported path
is ChatGPT mobile **Remote**, using the same desktop host's projects, chats,
files, plugins, school sign-ins and permissions.

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

Ask whether independent phone access is required. ChatGPT cloud Work can
continue on supported desktop/web/mobile surfaces, but cannot directly read
the student's local folder or use its browser session. Cloud-accessible
context and appropriate authorized tools are required.

A private hosted dashboard can be used in a phone browser. This application's
local file store and hosted D1 store are separate: matching profile IDs do not
synchronize them. Nor does opening the private Site grant a phone chat API
access. There is no authenticated plan connector in this plugin yet. Do not
claim that a local repository plugin or generic chat link provides that bridge.
Keep one authoritative plan and explain the actual missing connection; do not
silently create a second writable plan or label a copied snapshot as live sync.

Verified documentation, September 17, 2026:

- [Desktop chat links and parameters](https://learn.chatgpt.com/docs/reference/commands#deep-links)
- [Remote setup and host requirements](https://learn.chatgpt.com/docs/remote-connections)
- [Local and cloud work](https://learn.chatgpt.com/docs/use-chatgpt#choose-cloud-or-local-work)
- [Model selection](https://learn.chatgpt.com/docs/models)
