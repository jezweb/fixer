---
name: fixer
description: Prove a bug exists on camera, fix it, then prove it's gone on the same camera — a closed loop that returns before/after visual evidence (screenshots, GIF, video) plus a written verdict per issue. Use when chasing reported bugs or visual regressions, when "is this actually fixed?" needs proof rather than a claim, or when a fix has to be shown to a user/client. Sibling of walkabout (borrows its recorder) and the self-refining loop (borrows its iterate-until-done).
---

# fixer — catch it red-handed, then prove it's dead

A bug isn't fixed because the code changed and the tests went green. It's fixed
when the **same capture that caught it misbehaving** now shows it behaving — same
viewport, same steps, same checkpoints, only the result different. fixer is
that closed loop, and the deliverable is the **evidence**, not the assertion.

The shape, per issue:

```
SCOPE → PROVE-BEFORE → DIAGNOSE → FIX → PROVE-AFTER → PRESENT → (loop)
        the indictment           root cause           the acquittal
```

You **own** three things: the **case file** (`templates/case-file.md`, one per
issue, the contract everything hangs off), the **before/after assembler**
(`templates/compare.mjs`), and the **CDP recorder** (`templates/record-cdp.example.mjs`
— bundled so the video leg needs no walkabout install). Everything else you
**borrow** — don't rebuild it:

| Need | Borrow |
|---|---|
| Stills + DOM snapshot on any live URL | `playwright-cli` (`/playwright-cli` skill) |
| Moving video without shimmer | the bundled `record-cdp` recorder (`templates/record-cdp.example.mjs`) — CDP `Page.startScreencast` → timestamped JPEG frames → ffmpeg; same technique as walkabout, no walkabout dependency. **Never** Playwright `recordVideo` — it writes blink-y or 0-byte output (lived: 0 bytes every run) |
| GIF / side-by-side / stacked clip | `ffmpeg` (via `compare.mjs`) |
| Candidate bugs | `github` MCP (issues), `google-chat` MCP, app console/network, a `dev-tools:ux-audit` pass |
| Iterate fix→reprove until the gate passes | the loop machinery (`run-a-self-refining-loop` / ralph-loop) |
| Share the result | `pagedrop` MCP → `xr2.au/<slug>` |

`${CLAUDE_PLUGIN_ROOT}/templates/` holds the working files; transplant and adapt
them. `${CLAUDE_PLUGIN_ROOT}/docs/pattern.md` is the deep reference — update it
and its Adopters list when you learn something.

## 0 — SCOPE: get the candidates

Two ways in, both supported:

- **Hand-fed** (default): the user names a bug. Open a case file, go to PROVE-BEFORE.
- **Scan**: sweep the real sources and propose a ranked candidate list, then
  **confirm with the user before chasing a batch** — don't burn the loop on
  low-value noise.

```
github MCP        → open issues labelled bug, recent comments, reopened issues
google-chat MCP   → spaces where the team/clients report problems ("X is broken", screenshots)
chrome/playwright → console errors + 5xx/4xx network while walking the app
ux-audit          → a fresh walkthrough's findings list
```

One case file per confirmed candidate. Rank by user-facing impact × reproducibility.

## 1 — PROVE-BEFORE: the indictment

Reproduce it on a **deterministic, re-runnable** capture — because PROVE-AFTER must
replay it byte-for-byte. Pin everything that varies:

- **Where** — the **live** app for read-only-observable bugs. But when the repro
  needs a precondition you can't safely stage on prod (an FK-linked row, a
  patient with a related carer, a survey token — anything requiring a write), use
  a **local seeded dev DB** and pin the seed so AFTER replays the same data. Don't
  assume local can't show "deploy-class" DB failures: local Cloudflare D1 enforces
  FKs (`PRAGMA foreign_keys = 1`), so FK-constraint bugs DO reproduce locally.
- **Viewport(s)** — fixed px. If it's a responsive bug, capture each breakpoint.
  Lists often render a desktop `<table>` AND hidden mobile cards with the same
  text — scope locators to `getByRole('table')` or you'll grab the hidden twin.
- **Steps** — ordered, role-based locators, each ending at a **labelled checkpoint**
  (`01-list-loaded`, `02-after-submit`). The labels are the pairing key for AFTER.
- **Auth** — either reuse a Playwright `storageState` (gitignore it), or — faster
  for cookie/token stacks — POST the app's sign-in endpoint via `context.request`:
  it shares the page cookie jar, so one call logs in and the capture starts on the
  bug, not the form.

Capture at each checkpoint: **screenshot + animated GIF + full video + console +
network** — and grab the **failing response BODY**, not just the status; it usually
names the mechanism (`500 {"error":"Failed to delete surgeon"}` → an FK constraint,
not a permissions bug). Pin the **code location** (`file:line`) you suspect. Cap
stills at 1440px before re-reading (`sips -Z 1440`, per the screenshot rule). The
worked example + earned gotchas (modal stacking, shadcn `role="dialog"`, ESM
resolution) live in `docs/pattern.md` — skim it before your first capture.

**If you cannot reproduce it on camera, the verdict is `not reproduced` — stop.**
Don't fix blind. A bug you can't film is a bug you can't prove you fixed.

## 2 — DIAGNOSE

From the evidence, name the **mechanism** in code, not the symptom. "The list
shows stale rows" is a symptom; "the query caches on `projectId` but the cache key
omits the filter, so a filter change reuses the prior result set" is a cause. Write
it in the case file with `file:line`. A wrong diagnosis makes a green AFTER a lie.

## 3 — FIX

Smallest change that addresses the root cause. Note the diff in the case file.

## 4 — PROVE-AFTER: the acquittal

Re-run the **exact same capture spec** — same viewport, steps, checkpoint labels.
Same camera or the comparison is void. Then **pair frame-for-frame** against BEFORE
with `compare.mjs`. The after run does double duty: it must also show **nothing
adjacent broke** (regression check), so keep a couple of "should-be-unchanged"
checkpoints in the spec.

## 5 — PRESENT

`compare.mjs` emits per-checkpoint **side-by-side PNGs**, a **before→after GIF/clip**,
and a **`compare.html` slider**. Publish via `pagedrop` for a shareable `xr2.au` link.
Pair it with a short written summary: claim → mechanism → fix → verdict.

**Verdict is one of:** `proven fixed` · `not reproduced` · `partially fixed` ·
`regressed elsewhere`. Only `proven fixed` closes the case, and only with a real
BEFORE *and* AFTER on the same spec.

## 6 — LOOP

If AFTER still shows the bug (or a new one), back to DIAGNOSE — this is where the
self-refining loop earns its keep: iterate fix → reprove until the gate passes or
you hit a documented blocker. Then take the next case file.

## Proof gates (hard — these are the whole point)

| Gate | Why |
|---|---|
| No `proven fixed` without an AFTER capture paired to a real BEFORE | the loop's entire value is the symmetry; a one-sided "looks fixed" is the failure mode it exists to kill |
| Identical capture spec both sides | different camera = void comparison, you've proven nothing |
| You personally inspect the AFTER frames | aggregate "tests pass" is the start of verification, not the end — read the actual pixels |
| AFTER includes unchanged-checkpoint regression guards | a fix that breaks the neighbour isn't a fix |

The earned-place test for this skill: if a session could close a bug as fixed
*without* a same-spec before/after pair on disk, fixer wasn't used.
