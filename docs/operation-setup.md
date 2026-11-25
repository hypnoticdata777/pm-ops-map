# Operation setup walkthrough

The guide helps an operator organize one property and understand its operating loop. The responsibility map is company-wide; selecting a property does not create property-level task assignments. No business capabilities or stored records were removed.

## Seven steps

1. Company: saved name and operating profile.
2. Property: an existing starter property (selectable when multiple exist).
3. Contacts: resident context for that property or a vacant-property exception, plus a company-wide vendor record. Vendor availability is not verified.
4. People: at least one person and confirmation of the current roster. A solo operator is valid.
5. Responsibilities: the 12 starter tasks have owners present in the confirmed roster.
6. Maintenance: personal acknowledgement of the Submitted → Scheduled → In Progress → Completed lifecycle. No repair completion required.
7. Review: acknowledge the summary. Handbook export is optional. Deferred steps and wider gaps remain outstanding.

## Starter tasks

`tenant-comms-001`, `delinquency-001`, `delinquency-009`, `maintenance-001`, `maintenance-002`, `maintenance-004`, `maintenance-006`, `maintenance-007`, `maintenance-008`, `vendors-008`, `owner-relations-001`, `owner-relations-003`.

The stable list uses permanent IDs. Missing tasks remain explicit gaps. Unknown owners do not satisfy starter coverage, while existing full-map coverage calculations are unchanged. Company focus does not alter this initial list. Named ownership does not establish effort, expertise, or 24/7 availability.

## Architecture and persistence

- `setupModel.js`: pure derivation and roster signature.
- `setupPreferences.js`: local versioned choices with storage-failure fallback.
- `setupGuide.js`: shared UI and direct handoffs to existing tools.
- `renderLaunchPlan()` and relevant refresh paths update the guide, without replacing active forms.

Walkthrough choices live under `pm-ops-setup-v1`, with normal demo namespacing and reset registration. They are not included in JSON exports or sync payloads. Another browser derives business progress but requires its own review acknowledgements. A full workspace import or reviewed sync replacement resets local choices. Ordinary background sync preserves choices; data-derived gaps and roster confirmation still update.

A review acknowledgement is historical. Removing records can reopen individual gaps without forcing the walkthrough open. Restart clears guide preferences only.

## UI behavior

New users enter setup after company context. Existing users get an optional entry. The guide is visible across views and can be compacted. All application navigation stays available. Detailed launch resources remain available in a disclosure on Map & Review. Opening another guided form in the current view preserves unrelated unsaved form text. Practice opens an isolated demo tab and never marks the real workspace reviewed.

## Verification

Unit tests cover task identity, partial data, missing/unknown owners, roster changes, vacancy scoping, deferral, storage failures, and import/sync boundaries. Browser tests cover the solo-operator journey at phone width, resume, deferral, form preservation, demo isolation, and hostile imported names. Setup browser tests also run against the Pages production build.

Use `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, and `npm run test:e2e:pages`. Use the project-compatible browser installation. Chromium phone emulation is not real iPhone Safari verification; record any WebKit or physical-device limitations in the release report.

## Release and rollback

No task identity, business schema, backend, or sync payload changes are required. Keep a normal workspace export before production verification. Reverting the walkthrough commits restores previous UI behavior; unused local preferences are harmless. Restart walkthrough is never a business-data reset. Existing checklist, guide-dismissal, and reset keys remain compatible.

## Demo entry and real setup

The real workspace retains the seven-step checklist. **Show me an example first** opens the isolated demo in a separate tab, preserving the original form. Demo entry now shows a goal chooser rather than selecting an incomplete setup step. **Tighten maintenance flow** is playable; the other four guided scenarios remain **Coming next**; **Explore freely** opens the existing fictional workspace. **Demo choices** and reload return to the chooser without discarding edits. Demo learning never completes real setup. See the [implementation specification](plans/guided-demo.md).

The [maintenance demo guide](demo-guide.md) describes saved assignment and scheduling checks. Tour completion is a learning acknowledgement and does not change the real checklist.
