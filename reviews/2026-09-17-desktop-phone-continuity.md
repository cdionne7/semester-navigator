# Desktop and phone continuity review

Review: September 17, 2026. Candidate: v0.3.2-beta.1.

The previous dashboard opened `https://chatgpt.com/`. It did not select the
student's project or transfer live workspace context. The replacement uses the
documented desktop composer link with the physical student folder and a short
Semester Navigator request. It deliberately does not claim to send a message,
select Astra, or continue a particular existing conversation.

## Corrective loops

1. Reviewed the actual dashboard, local server, hosted store and official
   desktop/Remote documentation. Added a local-only runtime endpoint supplying
   the inspected root and profile identity. Hosted or mismatched responses
   cannot produce a desktop routing link.
2. Added the folder-specific handoff, stable course/assignment selection IDs,
   identity verification instructions and a copy fallback. Kept full notes,
   rubrics and grades out of the link. The fallback retains the useful request
   context for an existing student chat.
3. Added dashboard refresh after assistant saves. Protected pending writes,
   conflicts, open form drafts and obsolete responses. Tested actual browser
   and API writes instead of assuming that the chat link establishes data flow.
4. Independent review caught hosted-phone wording that implied local/cloud
   synchronization. Corrected the dialog to identify Remote as continuation of
   the computer's local workspace, with separate hosted storage.
5. Reproduced a two-tab recovery failure: a clean tab's background refresh
   replaced another tab's dirty browser backup. The refresh now preserves
   existing dirty or unreadable recovery copies. The regression verifies that
   the pending edit survives reload and can be explicitly discarded afterward.

## Validation results

- `npm test`: 101 passed; one native-Windows-only check skipped on macOS.
  Includes both runtime builds, updated packaging, real HTTP/model tests,
  isolated hosted-route tests and two detached student roots booting after
  their source archive is removed.
- `npm run test:e2e`: all 26 Chromium tests passed. New cases cover college
  and high-school routing, wrong identity and missing runtime fallbacks,
  copy behavior, pending/conflict restrictions, external assistant saves,
  delayed responses, open form drafts and recovery preservation across tabs.
- TypeScript, ESLint, plugin manifest and skill metadata validation passed.
  The dependency audit found no vulnerabilities.
- Desktop and 390px mobile dialogs were visually inspected. Both support
  internal scrolling without horizontal overflow. The final build centers
  dialogs and applies primary-action styling to the desktop link.

The runtime tests inspect the exact physical root, correct student profile and
selection IDs. They assert that the link has only documented `path` and
`prompt` parameters, includes the plugin, and excludes assignment titles,
rubrics and other full coursework. The local endpoint is GET-only and retains
the loopback server's host/origin protections. Hosted pages have no endpoint
that invents a local folder.

## Observed and unverified behavior

The live synthetic student dashboard in the in-app browser rendered the
folder-specific link and prepared request. Clicking **Open desktop chat**
completed as a browser action. Native app inspection was then denied by the
Computer Use policy for `com.openai.codex`. The selected native folder and
composer were therefore not observed. No message was sent. Browser link tests
and documented link semantics do not substitute for native routing acceptance.

Phone instructions follow the official Remote documentation: pair from desktop
Settings, choose the computer and student project on the phone, and keep the
computer awake, connected and running the desktop app. Remote retains access to
that host's workspace, plugins and school connections. No phone was paired and
no student exchange was observed on iOS or Android in this review.

A private hosted dashboard can be opened on a phone, but local file storage and
hosted D1 storage are independent. This plugin has no authenticated cloud plan
connector. A cloud chat cannot inherit a desktop folder or browser login by
following a link. Independent phone use with the laptop unavailable remains
unimplemented. Keep one authoritative plan rather than creating competing
writable copies.

These checks extend the [earlier synthetic college and high-school acceptance
review](2026-09-10-full-student-acceptance.md). They do not establish access to
the children's real school portals, actual mobile pairing, or delivery of a
student-visible reminder.

## Sources checked

- [Desktop deep links](https://learn.chatgpt.com/docs/reference/commands#deep-links)
- [Remote setup and host requirements](https://learn.chatgpt.com/docs/remote-connections)
- [Local and cloud work](https://learn.chatgpt.com/docs/use-chatgpt)
- [Model selection](https://learn.chatgpt.com/docs/models)
