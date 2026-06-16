# proofloop — design rationale and deep reference

## Why it exists

The family already had the pieces but not the loop that joins them:

- **walkabout** captures (scripted page walks, narrated video) — a *camera*.
- **self-refining loop / ralph-loop** iterate until done — a *loop engine*.
- **ux-audit** finds what's broken — a *discovery engine*.
- **verify-visually** checks one change once — a *single shot*.

None of them do the symmetric **prove-it-broken → fix → prove-it-fixed** cycle,
and none start from "go read the issues and the chat and find the candidates".
proofloop is the composition layer that does, and its output is *evidence* — a
before/after pair on the same capture spec — not an assertion that it's fixed.

## The one idea: evidence symmetry

The capture that catches the bug misbehaving is re-run, unchanged, after the fix.
Same viewport, same steps, same checkpoint labels. Only the behaviour differs. It
is the visual equivalent of a red test you turn green: the red run and the green
run exercise the identical thing. Break the symmetry (different viewport, extra
step, relabelled checkpoint) and the comparison proves nothing.

This is why the **repro spec** (`spec.json` in the case file) is the spine: BEFORE
and AFTER are two runs of one spec, and `compare.mjs` pairs them by checkpoint label.

## What proofloop owns vs borrows

Owns (lives here): the **case-file contract** and the **before/after assembler**
(`compare.mjs`). These are the genuinely-new parts.

Borrows (do not duplicate): capture (playwright-cli + walkabout's `record-demo.mjs`,
which uses CDP screencast → PNG → ffmpeg, *not* Playwright `recordVideo` — its
adaptive VP8 encoder makes the whole page shimmer), GIF/video stitching (ffmpeg),
discovery (github + google-chat MCPs, console/network, ux-audit), iteration (the
loop skills), sharing (pagedrop → xr2.au).

If you find yourself writing a capture engine here, stop — extend walkabout's
recorder or call playwright-cli instead. A second camera that drifts from the first
is exactly the derived-file rot to avoid.

## The proof gates (the whole point)

1. No `proven fixed` without an AFTER paired to a real BEFORE on the same spec.
2. Identical spec both sides, or the comparison is void.
3. A human (you) inspects the actual AFTER frames — "tests pass" is the start of
   verification, not the end.
4. AFTER carries unchanged-checkpoint regression guards — a fix that breaks the
   neighbour isn't a fix.

## Capture notes

- **Auth**: reuse a Playwright `storageState` JSON for logged-in apps; gitignore it.
  See walkabout's `record-tour.mjs` header for how to mint one.
- **Determinism**: role-based locators, fixed viewport, explicit waits on a settled
  selector (not arbitrary sleeps), so the two runs line up frame-for-frame.
- **Responsive bugs**: add each breakpoint as its own checkpoint set in the spec.
- **Stills**: cap at 1440px (`sips -Z 1440`) before re-reading, per the screenshot rule.

## Storage

Per project: `<project>/.jez/proofloop/<slug>/` holding `case.md`, `spec.json`,
`before/`, `after/`, `compare/`. Commit the markdown + spec; gitignore the binaries
(`before/`, `after/`, `compare/*.png`, `*.gif`, `*.mp4`).

## Adopters

- _(none yet — add the first app proofloop closes a case on, with a one-line note
  on anything that surprised you)_
