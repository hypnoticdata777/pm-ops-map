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

## Guided demo foundation

The user reported the previous demo moved smoothly on iPhone Safari, but its setup-step entry was confusing. That report does not validate the new chooser. The foundation adds chooser, free-exploration and keyboard/isolation browser coverage; physical iPhone validation of this revision remains pending. Maintenance is now playable on the implementation branch. Physical iPhone validation of its editor scrolling, saved-state checks, resume and finish remains pending after deployment.
