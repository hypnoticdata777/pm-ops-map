# Browser validation status

## Evidence, not historical minimum-version promises

The prior README minimums (Chrome 80+, Firefox 74+, Safari 13.1+, Edge 80+) are withdrawn as unverified. The current app uses native `HTMLDialogElement.showModal()`, modern JavaScript, and dynamic viewport CSS. A browser running some earlier screens is not evidence that the whole application works there.

Recorded checks for glossary implementation commit `8dd2c70`, merged through PR #94:

| Environment | Recorded result | Limit |
|---|---|---|
| Playwright 1.61.0 Chromium on Linux | 91 source browser tests passed | Not a claim about every Chrome version or operating system |
| Production build, Pages-style path and desktop `file://` | 36 browser tests passed | Does not verify a published release ZIP or iPhone Files behavior |
| Chromium at 390 × 844 and 844 × 390 | Glossary layout, search, keyboard/focus, and contextual help passed | Viewport emulation, not physical iPhone Safari |
| Playwright WebKit | Launch blocked by missing host libraries | No WebKit compatibility result |
| Physical iPhone Safari | Not yet verified | Use the hosted app as the intended mobile entry point |
| Firefox and Edge-specific runs | Not recorded for this release | Do not advertise tested support or minimum versions |

A user-agent or viewport setting does not change Chromium into Safari. Passing Chromium checks cannot establish iOS storage, on-screen keyboard, download, or Files integration behavior.

## Validation still required

Before expanding the advertised browser support policy, record browser/OS versions, tested revision, delivery mode, and results for setup, glossary, task edits, work orders, reload/persistence, and JSON export/import recovery. Include an actual iPhone Safari pass and document failures rather than substituting emulation results.

Desktop local builds must retain their assets beside `index.html`. Export before moving or replacing a build; browser storage continuity across file locations and browsers is not guaranteed. A packaged release will need its own extracted-artifact verification under the [release specification](releases.md).

## Guided demo and orientation refinements

Foundation PR #101 and maintenance PR #102 are merged. The operator reported successful maintenance use on iPhone and requested a clearer header and smaller demo strip. Exact device/OS and the tested deployed revision were not independently recorded; this is scoped user feedback, not general Safari certification.

Refinement 3A adds a stronger application header, a collapsed native DEMO disclosure and live sticky-banner clearance. Source/production browser checks cover portrait and short landscape, keyboard toggling, reset/return actions and tour-target visibility. Fresh physical iPhone validation of this revision remains pending after deployment. The later 3B–3D refinements and phase 4 scenarios are not implied by this evidence.
