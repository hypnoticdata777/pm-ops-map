# Field Note: PM Ops Map Phase 2 — Positioning the Wedge

**Date:** 2026-10-13  
**Phase:** 2 — Positioning  
**Status:** Complete

## The decision

Phase 2 was the correct next step after the Phase 0 trust fixes and Phase 1 foundations. The product had accumulated useful capabilities, but the public story still described it like a broad property-management operating system. That made the strongest capability — responsibility clarity — harder to see.

The new product spine is:

**Map → Assign → Review → Share**

- **Map:** make departments and responsibilities visible.
- **Assign:** attach owners, priorities, due dates, and dependencies.
- **Review:** surface unowned work, blockers, overdue work, workload concentration, and readiness gaps.
- **Share:** export the map or handbook, or use the optional trusted-team sync.

## What changed

- Rewrote the README headline and opening story around responsibility mapping.
- Added the four-verb workflow so a recruiter, operator, or collaborator can understand the product in one pass.
- Reframed Work Orders and Portfolio as context views rather than the product's center of gravity.
- Renamed the navigation labels to reflect user intent: Map & Review, Share Map, Assign Owners, Context: Work Orders, and Context: Portfolio.
- Added explicit non-goals to the README and contributor guide.
- Removed roadmap promises that would pull the project toward a tenant portal, accounting product, document store, or full system of record.
- Updated page and social descriptions to match the focused wedge.

## Analogy

PM Ops Map is closer to an **air-traffic control board for responsibility** than to an aircraft engine.

It does not replace the systems that perform accounting, leasing, payments, or dispatch. It gives the team a shared radar screen: what exists, who is responsible, what is drifting, and where a handoff could fail. The systems of record remain the engines; PM Ops Map makes the operating picture legible.

## Software-tech item

### Boundary-driven information architecture

The implementation uses product boundaries as an information-architecture constraint. The primary navigation now reflects the core domain workflow, while secondary views are labelled as context. This is a low-risk change because the underlying view IDs and JavaScript routing remain stable; only the user-facing labels and documentation changed.

That distinction matters in a mature codebase: preserve stable identifiers and behavior contracts, then change the presentation layer deliberately. It lowers regression risk while aligning the product's mental model with its actual value.

## Evidence

- The Phase 0 and Phase 1 commits are present in origin/master through 4cb3f59.
- The Phase 0 test migration runs Vitest against shipped ES modules rather than CommonJS mirrors.
- Phase 1 adds permanent IDs, runtime validation, tsc --noEmit, and Playwright coverage.
- Production Webpack build passes after the positioning changes.

## Next engineering implication

The next feature work should strengthen the review loop, not widen the product. Responsibility intelligence — criticality, backup ownership, review cadence, and readiness diagnostics — is the natural Phase 3 continuation because it deepens the Map → Assign → Review → Share workflow.
