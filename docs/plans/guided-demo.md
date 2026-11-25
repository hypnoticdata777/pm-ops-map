# Guided demo implementation specification

Status: phases 1–2 complete, foundation merged in PR #101. Phase 3 maintenance implemented on a review branch; fresh iPhone validation pending. Other four scenarios and phase 5 delivery review remain pending.
Date: 2026-11-25.

## Objective and verified baseline

Help visitors choose an operational goal, understand why a screen matters, perform a small action, and see its result before starting their own operation.

Baseline: origin/master at `9335224`; backup guidance PR #100 merged on 2026-11-24. No application behavior changes are included in this specification.

Verified current behavior:

- The onboarding example button opens `?demo=1` in a separate tab. Keep this behavior to preserve the original setup form.
- `demoMode.js` supplies demo-prefixed storage keys and has no dependencies. `demo.js` seeds fictional data before rendering and disables Team Sync.
- `setupModel.js::deriveSetup()` selects the first incomplete setup step; `setupGuide.js` uses that selection unless a step preference exists. Prefilled data can skip earlier steps. A specific saved step also depends on local guide preferences; do not hard-code a step-3 workaround.
- `app.js::switchView(view, tabEl)` updates panels, navigation, filters, and renderers. Tours must use this navigation rather than manipulate visible panels separately.
- `showcase.js` contains stable fictional records, including submitted, unassigned `demo-wo-1`: “No hot water in unit 7C” at Cedar Court Apartments.
- Work-order editing uses `showEditWorkOrderModal(id)` and `commitNewWorkOrder()`; advancing uses `advanceWorkOrder(id)`. These paths persist and rerender directly, so observing only `commit.js` would miss changes.

## Scope and delivery boundaries

| Phase | Deliverable | Exit condition |
|---|---|---|
| 1 | This behavior specification, maintenance copy, dependencies and acceptance criteria | Current code verified; decisions and remaining work recorded |
| 2 | Chooser, scenario definitions, isolated progress, panel, navigation and target lifecycle | Foundation tested without claiming unfinished scenarios are available |
| 3 | Complete Tighten maintenance flow scenario | Automated coverage and fresh physical iPhone validation |
| 4 | Four remaining scenarios | Each has reviewed copy, reliable actions and a clear ending |
| 5 | Final regression, documentation, screenshots and delivery checks | Production build and extracted package verified; limitations recorded |

Do not implement all five scenarios in the first application PR. Before phase 3 ships, unfinished cards may be labelled “Coming next” without a start button. Advertise only playable scenarios. No runtime dependencies or backend are needed; retain file:// operation.

## Entry and shared controls

- A fresh demo visit shows “What would you like to try?” with goal cards and Explore freely.
- Every demo page load starts at the chooser. If valid saved progress exists, offer “Resume [scenario]” separately; never skip the chooser automatically.
- Choosing a scenario opens its first step; Resume opens the saved step. Existing demo edits are preserved in both cases.
- Guidance shows scenario title, “Step N of M,” why this matters, what to notice, one action, and expected result.
- Controls: Back, Next, Explore freely. The first Back is disabled. Action steps enable Next only when their state condition is met; reading steps allow Next immediately. No automatic advancement.
- Back changes guidance, not workspace data. Explain this near restart controls.
- Manual tab navigation pauses guidance/highlighting and offers “Return to this step”; it must not drag users back automatically.
- Explore freely pauses the tour and removes highlights. A persistent Demo choices control returns to the chooser. Suppress real setup prompts in demo mode; keep resources accessible through free exploration.
- Finish offers Try another demo and Set up my operation. The latter returns to the normal app URL, preserving any existing real workspace and copying no fictional data. Do not promise an empty setup screen if real data exists.
- Direct ?demo=1 links follow the same rules. Scenario deep links are outside the first implementation.

## Scenario catalogue

| ID | User-facing title | Starting area | Learning goal |
|---|---|---|---|
| operation | Set up an operation | Portfolio and operation overview | Understand the company, property, contacts and people before assigning responsibilities |
| ownership | Clarify who owns the work | Tracking | Find an unowned responsibility and choose an owner |
| workload | Balance the team's workload | Team, then Tracking | Compare assignment counts and review a reassignment; counts do not establish capacity |
| maintenance | Tighten maintenance flow | Work Orders | Assign an example repair and track its next stage |
| gaps | Review operational gaps | Existing Map & Review/resources | Explain a gap and follow its existing corrective action; indicators do not certify compliance |

Use one shared fictional operation. Scenario-specific datasets are deferred until a concrete learning need justifies them. The other four scenarios require detailed step definitions before phase 4; their titles alone are not implementation specifications.

## Maintenance scenario: reviewed implementation draft

Five steps; record `demo-wo-1`. Required screen: Work Orders. Example roster includes Marcus Reyes with maintenance affinity; any current roster member is valid for the assignment exercise. Guidance suggests Marcus but does not assert availability or qualifications.

| Step | Guidance | User action | Completion rule |
|---|---|---|---|
| 1. See the problem | “Start here because a repair needs a clear owner and a visible next step. This fictional no-hot-water report is waiting for assignment.” Highlight the example card. | Read and select Next. | Reading step; target record exists. |
| 2. Give it an owner | “Open this repair, choose who will handle it, and save. Marcus Reyes is the example maintenance contact; the app does not verify availability.” Highlight Edit, then the assignee and save controls. | Edit the example, choose a roster member, save. | Persisted/in-memory applied record has an assignee present on the current roster, not UNASSIGNED. An unsaved selection does not count. |
| 3. Make the next stage visible | “For this fictional exercise, assume access and timing have been agreed. Move the repair from Submitted to Scheduled. Changing status does not contact anyone or book a visit.” Highlight the advance control. | Advance the example repair. | Valid assignee remains; status is scheduled, in-progress or completed. Explain “already beyond Scheduled” when applicable. |
| 4. Understand follow-through | “Scheduled records the stage you selected. In real work, coordinate access, follow up, and verify the repair before marking it completed. No repair needs to be closed for this tour.” Highlight the current card/status. | Read and select Next. | Reading step; target record exists. |
| 5. Review the result | “You have seen how ownership and status make a repair easier to follow. This example has not dispatched a technician or verified a repair.” Show actual current assignee and status. | Try another demo or Set up my operation. | Record tour completion separately from setup; require valid assignee and status at Scheduled or beyond. |

Never advance status, assign a person, or close a repair merely to make guidance progress. Highlight the actual current column if the repair moves. No emergency-response protocol is implied by this example; urgency rules remain an operator responsibility.

## Progress, editing and recovery rules

| Situation | Required behavior |
|---|---|
| Reload | Show chooser with Resume; restore only valid scenario/step IDs. Do not replay mutations. |
| Switch scenarios | Preserve demo edits, retain the previous scenario checkpoint, open the selected scenario at its first step. |
| Restart guidance | Reset that scenario's checkpoint only. Label “Restart guidance (keep demo edits).” |
| Need pristine examples | Offer existing Reset demo with confirmation that all demo edits and tour progress will be discarded. Cancellation changes nothing. |
| Action already satisfied | Explain “Already done in this demo.” Allow Next without forcing a redundant change. Do not claim the visitor just performed it. |
| Assignment/status changed back | Re-evaluate from actual state. Block a dependent action/finish and offer Return to assignment or scheduling; do not silently rewind navigation. |
| Record deleted or roster empty | Explain why the scenario cannot continue. Offer chooser/free exploration or confirmed Reset demo. Never silently recreate data. |
| Target not mounted | Navigate/render first, then locate target. If unavailable, show written guidance and a recovery action; never highlight an unrelated control. |
| Storage unavailable | Keep the tour usable in memory and state that progress may not survive reload. Existing demo workspace persistence limits still apply. |
| Import or snapshot restore in demo | Clear tour checkpoints and return to chooser; revalidate records before starting another tour. Never apply this behavior to real-workspace setup. |
| New or invalid tour format | Ignore invalid/unknown IDs safely and show chooser without changing operational data. |

Proposed demo-only storage key: `pm-ops-demo-tour-v1`, registered centrally in `storage.js` with a demo-mode guard. It must never become a shared real-workspace preference. Versioned data contains only selected scenario and validated per-scenario checkpoints/completion acknowledgements, not copies of workspace records. Completion acknowledgements are historical; live action conditions are rechecked on resume. Exclude this data from JSON, clipboard state and Team Sync. Demo reset clears it; real reset must not clear demo preferences accidentally.

## Code responsibilities and dependencies

- `demoScenarios.js` (new): declarative copy, step IDs, stable targets, completion-rule identifiers. No DOM or persistence.
- `demoTourPreferences.js` (new): validation, versioning, demo-only persistence and memory fallback.
- `demoTour.js` (new): chooser, guidance, state checks, target cleanup and recovery. Inject navigation/state adapters to avoid importing `app.js` and creating a circular dependency.
- `app.js`: initialize after hydration/rendering; provide navigation adapter resolving both view and nav button. Current switchView requires both.
- `demo.js`: entry/reset integration. Keep demoMode.js dependency-free.
- `setupGuide.js` / `launchPlan.js`: suppress competing demo prompts without changing real setup derivation or removing business features.
- `views/workorders.js`: stable card/action targets and a refresh notification after successful save/advance/delete. Do not infer action completion from clicks or rely solely on commit.js.
- Other views: add only targets/hooks required by implemented scenarios.
- `index.html` / `css/style.css`: chooser, compact panel and accessible targets; no blocking spotlight overlay.

Use explicit state-change notifications or injected refresh callbacks, not polling or broad DOM mutation observers. Keep target IDs/data attributes stable across rerenders. Remove highlights and handlers when paused, exited or reset. Guidance must not nest inside a modal that its actions need to open.

## Mobile, accessibility and security requirements

- Compact panel above active content; no fixed overlay covering inputs or modal actions.
- At least 44px touch controls, readable copy, no horizontal overflow at 390px, and support short landscape viewports and zoom.
- Written instructions accompany highlighting; support keyboard focus, visible focus indicators, reduced motion and polite status announcements.
- Move focus on explicit navigation to a relevant heading; do not steal focus during typing or rerenders. Respect existing modal focus boundaries.
- Treat record names as untrusted text; use textContent or existing escaping. New imported fields are unnecessary.
- No real workspace keys, sync connection, permissions or notification prompts may be changed by starting a tour.

## Acceptance and verification plan

Phase 2: chooser on fresh/direct/repeat entry; correct view/nav integration; checkpoint validation; storage failure; pause/resume/back; cleanup and isolated reset. No unfinished scenario can be started.

Phase 3: exercise the real editor/save and advance actions; canceled edits do not complete steps; existing satisfied data is labelled honestly; deleted target, empty roster, reversed changes, import/restore, reload and reset recovery work. Assert the original real workspace remains byte-for-byte unchanged by demo actions.

Run unit/type checks and browser coverage for source, production under /pm-ops-map/, and extracted file:// package. Inspect desktop and 390px screenshots. Test keyboard and modal interactions. Recheck the selected repair after rerenders without relying on text selectors.

Physical iPhone report so far: user found the existing demo responsive and smooth but its entry confusing. This is not validation of the new chooser/tour or of every export/recovery function. Obtain a new iPhone Safari check after phase 3 deployment: chooser, assignment/save, status advance, panel scrolling, exit and resume.

## Documentation rollout and dependencies

This phase changes planning documentation only. During implementation update README, operation-setup.md, contributor instructions, architecture references, changelog, release checks and browser-support evidence alongside actual behavior. Create a user-facing demo-guide.md only when playable guidance exists. Replace screenshots after UI stabilizes. Keep planned scenarios explicitly planned.

No external service or new package dependency is required. Remaining inputs: refine operational copy with the user as needed; validate the maintenance pattern on iPhone before expanding; review detailed steps for the other four scenarios before phase 4. Do not delay phase 2 foundation work for optional wording refinements. Release publication remains a separate reviewed action.
