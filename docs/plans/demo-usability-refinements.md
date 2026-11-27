# Guided demo usability refinements

This is the guided-demo delivery workstream, separate from the architecture phases in ROADMAP.md. The real seven-step setup and existing business tools remain available.

## Baseline and position

- Foundation PR #101 and maintenance PR #102 are merged. Implementation baseline: master `a616586`.
- The operator reported that the maintenance experience worked well on iPhone, then requested stronger branding, a smaller sticky demo disclosure, work-order quick filters and practical control help. Device/OS and the exact tested deployed revision were not independently recorded.
- This feedback starts a bounded phase 3 refinement loop. Four remaining guided scenarios resume only after its combined validation gate.

| Refinement | Scope | State |
|---|---|---|
| 3A | Stronger application identity and compact sticky DEMO disclosure | Implemented on a review branch; fresh device check pending after deployment |
| 3B | All/Open/Unassigned/Completed work-order filters in real app and demo | Planned; separate implementation |
| 3C | Tap/keyboard question-mark help with purpose and examples | Planned; separate implementation |
| 3D | Combined regression and fresh iPhone validation of refinements | Pending 3A–3C |
| 4 | Operation overview, ownership, workload, operational-gap scenarios | Resume after 3D passes |
| 5 | Cross-scenario documentation, browser and delivery review | After phase 4; publication is a separate deliberate action |

## 3A implementation

- A larger PM Ops Map wordmark and a property-management kicker identify the application at entry. The main header scrolls normally.
- One compact sticky strip retains PM Ops Map and the DEMO badge. Its native details/summary disclosure starts collapsed; the summary remains visible when details are closed.
- Expanded details retain fictional-data guidance, Demo choices, confirmed Reset demo and a normal-workspace link. The latter explicitly targets index.html so direct file:// builds do not navigate to a directory listing.
- Opening/closing the disclosure does not save a new preference, change records or affect real-workspace data.
- Choosing a demo from the strip and explicit tour-step navigation collapse the details before locating the heading.
- `demoLayout.js` measures current banner height plus a gap and exposes a CSS clearance variable. Toggle, ResizeObserver, window resize and visual-viewport resize keep it current. Explicit heading/target navigation uses the same measurement; the old 180px assumption is removed.
- Resize correction preserves focus and does not scroll a modal's underlying page. Expanded content can scroll within a short viewport while the summary remains reachable.

### Acceptance checklist

- [ ] Verify the current revision and deployed baseline before review/merge.
- [ ] Identify PM Ops Map at chooser entry and during maintenance.
- [ ] Verify collapsed default, keyboard Enter/Space, visible focus and touch-friendly actions.
- [ ] Reach all expanded actions in portrait, short landscape and zoomed layouts.
- [ ] Keep headings and highlighted targets clear of collapsed and expanded strip heights.
- [ ] Preserve confirmed/canceled reset, real-workspace return and demo isolation.
- [ ] Verify source, production Pages sub-path and extracted desktop file:// builds.
- [ ] Record fresh physical iPhone observations after deployment. Chromium phone width is not Safari proof.

Automated results and review status belong in the PR. The checklist is an acceptance reference, not a claim of physical-device execution.

## Later refinements and return path

3B keeps counts based on the whole workspace; Unassigned overlaps Open. Filter choice is temporary view state outside exports/sync. Explicit tour handoffs reveal the example without overriding user filtering on every redraw.

3C explains existing controls without activating them. Reuse glossary wording where applicable, with purpose/examples in a shared help catalogue and accessible dialog behavior. No new backend or runtime package is needed.

3D validates all refinements together on the actual deployed revision, including a fresh iPhone run. Resolve blocking issues here before expanding the scenario catalogue.

Phase 4 proceeds through operation overview, ownership, workload and gap scenarios, with detailed rules, implementation, tests, docs and review for each. Phase 5 reviews the full experience and delivery package. Later backlog work requires separate prioritization; this loop does not authorize merging, tags or release publication automatically.
