# Guided demo

Open the hosted app's **Show me an example first** button, or visit `?demo=1`. The original setup form stays in its tab. The demo uses fictional data and separate browser storage; practicing never completes real setup or copies example records into your operation.

## Recognize the application and demo

The larger **PM Ops Map** header marks the starting point. A compact **PM Ops Map · DEMO ▾** strip stays at the top while you scroll. Tap the strip, or focus its summary and use Enter/Space, to reveal the fictional-data explanation and demo actions. Expanded content scrolls if the screen is short.

Details start collapsed and do not create a saved preference. **Demo choices** returns to the chooser and collapses the details; starting or explicitly returning to a tour step also collapses them. The DEMO badge remains visible. Opening or closing this disclosure does not reset data. **Use your own workspace** opens the normal index.html in hosted and direct desktop file builds without copying example data.

## Choose a goal

**Tighten maintenance flow** is the first playable scenario. The other four goals remain labelled **Coming next**. **Explore freely** opens every existing demo tool without a tour. **Demo choices** returns to the chooser without deleting edits.

## Tighten maintenance flow

Choose **Try this demo** on the maintenance card. The tour opens Work Orders and follows the fictional “No hot water in unit 7C” report at Cedar Court Apartments.

1. **See the problem:** identify the unassigned repair and understand why work starts here. Choose Next.
2. **Give it an owner:** choose Edit on that repair, select a current roster member, and save. Marcus Reyes is the example maintenance contact; availability and qualifications are not verified. Canceling or choosing without saving does not complete the step. Guidance also appears inside the editor.
3. **Make the next stage visible:** assume access and timing have been agreed for this fictional exercise, then use the Scheduled action. A status change does not contact anyone or book a visit.
4. **Understand follow-through:** review the owner and stage. Real work still requires access coordination, follow-up, and verification before closeout. No repair must be closed to finish the tour.
5. **Review the result:** review the actual owner and status, then choose Finish. The acknowledgement records learning, not evidence that a technician was dispatched or a repair verified. Urgency and response rules remain your responsibility.

The tour enables Next after the required applied state exists; it does not advance automatically. Later stages also satisfy the scheduling exercise. If a condition is already satisfied, the tour says so instead of claiming you just performed the action.

## Work-order quick filters

The counts are buttons in both the demo and real app: All, Open, Unassigned, Completed. Totals cover the whole workspace even when fewer cards are visible. Unassigned is a subset of Open. The status columns remain visible; their counts describe the displayed records.

Choosing a filter preserves your selection through edits and tab changes, but reload starts at All. Assigning a repair can remove it from Unassigned; completing it can remove it from Open. The record still exists. An empty filter offers Show all work orders. JSON export still contains all work orders.

Starting/resuming or explicitly navigating a tour step reveals its example by selecting All. Ordinary redraws keep your filter. If it hides the example, guidance says so and offers Show example. A genuinely deleted record still explains reset/recovery; it is not described as filtered out.

[Selected filter](screenshots/13-work-order-filters.png) · [Empty-result recovery](screenshots/14-work-order-filter-empty.png). These are Chromium phone-width captures.

## Controls and recovery

- **Details and tour options** contains the expected result, current example summary, exploration and restart controls.
- **Back** changes guidance only; it does not undo edits.
- **Show highlighted control** scrolls to the relevant card or control. Written instructions accompany outlines.
- Opening another tab pauses the tour. **Return to this step** restores its screen and guidance.
- Reload opens the chooser with **Resume Tighten maintenance flow**. Previously completed guidance is offered as **Review Tighten maintenance flow**; conditions are checked again.
- **Restart guidance (keep demo edits)** returns to the first explanation without reverting assignments or statuses.
- Missing records, an empty roster, or reversed assignments block dependent steps and explain recovery. Do not change real-world status just to complete guidance.
- **Reset demo** asks before discarding all demo edits and progress and restoring fictional examples. Cancel preserves them. A full import or snapshot restore also clears tour progress because it replaces the underlying example data.
- If browser storage fails, guidance remains available in memory; progress may not survive reload. The app cannot guarantee workspace persistence when browser storage is unavailable.

At the finish, choose **Try another demo**, restart the guidance, explore freely, or **Set up my operation**. The last option opens the normal workspace: existing real data is preserved, and fictional data is not copied.

Completion history is browser-local and excluded from JSON exports, clipboard state and Team Sync. It is a historical acknowledgement, not an operational readiness or compliance guarantee.

[Phone-width maintenance guidance](screenshots/11-maintenance-demo.png).

## Browser evidence

The operator reported that maintenance worked well on iPhone before these orientation refinements. Device/OS and the exact deployed revision were not independently recorded. That observation supports the existing tour's usability, not every browser or recovery path. The compact disclosure and new header still need a fresh physical iPhone check after deployment; Chromium phone-width checks do not establish Safari compatibility.
