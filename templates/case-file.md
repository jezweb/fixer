<!--
proofloop case file — one per issue. Lives in <project>/.jez/proofloop/<slug>/case.md
alongside its evidence: before/ after/ compare/ subdirs.
Fill top-to-bottom; the loop fills the next field at each stage. A case closes
only at verdict: proven fixed, with both before/ and after/ populated from the
SAME spec.json.
-->

# Case: <short title>

| | |
|---|---|
| **Slug** | `<kebab-slug>` |
| **Source** | github#NN · chat-link · observed · ux-audit |
| **Opened** | YYYY-MM-DD |
| **Impact** | who hits this, how often, how bad |
| **Status** | open · diagnosing · fixing · reproving · **closed** |

## Claim
What's wrong, in one or two plain sentences. The thing the user actually sees.

## Repro spec  → `spec.json`
The deterministic, re-runnable capture. BEFORE and AFTER both run this, unchanged.

- **URL**: `https://…`
- **Viewport(s)**: e.g. `1440×900`, `390×844`
- **Auth**: `storageState` path (gitignored) or none
- **Steps → checkpoints** (role-based locators; each ends at a labelled shot):
  1. navigate → `01-loaded`
  2. `getByRole('combobox', {name:'Filter'}).selectOption('review')` → `02-filtered`
  3. … (keep 1–2 "should-not-change" checkpoints as regression guards)

## BEFORE — the indictment  → `before/`
- [ ] Reproduced on camera (else verdict = **not reproduced**, stop)
- Screenshots: `before/01-loaded.png` …
- GIF: `before/repro.gif` · Video: `before/repro.mp4`
- Console: `before/console.txt` · Network: `before/network.txt`
- Suspected code: `file:line`

## DIAGNOSIS
The **mechanism** in code, not the symptom. `file:line`. State why this produces
exactly what BEFORE shows.

## FIX
- Change: `file:line` — what and why (smallest change at root cause)
- Diff / commit: `<sha>`

## AFTER — the acquittal  → `after/`
Same `spec.json`. Paired against BEFORE via `compare.mjs`.
- Screenshots: `after/01-loaded.png` … (labels match BEFORE)
- GIF/clip: `after/repro.gif`
- Regression guards held: [ ] yes
- Comparison: `compare/compare.html` · published: `xr2.au/<slug>`

## VERDICT
`proven fixed` · `not reproduced` · `partially fixed` · `regressed elsewhere`

One-paragraph summary for the user/client: claim → mechanism → fix → proof link.
