---
name: fixer
description: Prove a bug exists on camera, fix it, then prove it's gone on the same camera — a closed loop that returns before/after visual evidence (screenshots, GIF, video) plus a written verdict per issue. Also runs in VERIFY mode — prove an already-shipped change meets its original requirement and return a client-readable verdict. Use when chasing reported bugs or visual regressions, when "is this actually fixed?" needs proof rather than a claim, when a fix has to be shown to a user/client, or when verifying someone's merged PR is genuinely done against its spec. Sibling of walkabout (borrows its recorder) and the self-refining loop (borrows its iterate-until-done).
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

fixer runs in **two modes** that share all the machinery below (the camera, the
blind-audit gate, the recorder, the proof gates):

- **FIX** (default) — a reported bug. Prove it broken, fix it, prove it fixed. The
  loop above.
- **VERIFY** (acceptance) — an *already-shipped* change (a merged PR, often someone
  else's work) that someone needs to *trust* is done. There's no "prove broken"
  half: the source of truth is the **original requirement**, not a bug, and the
  output is an acceptance verdict + a client-readable ✓, not a fix. See
  [**Verify mode**](#verify-mode-acceptance--prove-someone-elses-ship-is-done) below.

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

**The journey is a free bug-scan.** Walking the real path surfaces *adjacent*
breakage you weren't hunting — a stray console error, a second control that
misbehaves, a modal that opens when it shouldn't. Log it. The one-bug focus is the
thing that makes you walk past the other three the camera just caught; capture them
as their own candidates instead of dropping them.

**If you cannot reproduce it on camera, the verdict is `not reproduced` — stop.**
Don't fix blind. A bug you can't film is a bug you can't prove you fixed.

## 2 — DIAGNOSE

From the evidence, name the **mechanism** in code, not the symptom. "The list
shows stale rows" is a symptom; "the query caches on `projectId` but the cache key
omits the filter, so a filter change reuses the prior result set" is a cause. Write
it in the case file with `file:line`. A wrong diagnosis makes a green AFTER a lie.

**Before you fix, confirm the surface is reachable.** Grep the component/handler
you're about to change up to a routed page — fixing an orphan (a component nothing
renders, a hook nothing calls) yields a clean AFTER the user never sees. If the only
importers are test files, you're about to fix the wrong thing.

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

**Two cuts, two audiences.** The evidence has two readers, and they need different things:
- **Author / you** — the full technical verdict: claim → mechanism → fix → before/after → any *surfaced* issues the journey caught.
- **Stakeholder** (client, QA, non-technical owner) — a ~10-second clip + ONE plain-English line ("✓ the Theatre List now colours per hospital, matches the schedule"). No jargon, no file paths, no caveats they can't action.

**Routing rule (load-bearing).** A clean pass → the stakeholder gets the ✓-cut directly. Anything short of a clean pass (`partially fixed` / `regressed elsewhere` / a gap) → the **author + owner hear first, privately**, and it's fixed before the stakeholder sees anything. Pushing a half-met verdict straight to the client is the trust-burning failure this rule exists to prevent.

**Verdict is one of:** `proven fixed` · `not reproduced` · `partially fixed` ·
`regressed elsewhere`. Only `proven fixed` closes the case, and only with a real
BEFORE *and* AFTER on the same spec.

## 6 — LOOP

If AFTER still shows the bug (or a new one), back to DIAGNOSE — this is where the
self-refining loop earns its keep: iterate fix → reprove until the gate passes or
you hit a documented blocker. Then take the next case file.

## Verify mode (acceptance) — prove someone else's ship is done

Same camera, different source of truth. Use when an already-merged change claims to
satisfy a requirement and someone needs to **trust** it's done — a client, a QA lead,
a PM signing off another dev's PR. This is fixer's prove-and-verdict half pointed at a
requirement instead of a bug; there is no "prove broken" stage.

Inputs: the **change** (PR / commit) **and** its **original requirement** — the
ticket, card, or spec, in the words the work was meant to satisfy. If you can't find
the requirement, get it before filming. "Looks right" is not acceptance.

1. **Turn the requirement into checkpoints.** Same labelled steps as PROVE-BEFORE,
   but each checkpoint asserts a *clause of the requirement*, not a bug repro. If the
   card says "colour each hospital + show the legend", that's two checkpoints.
2. **Run the journey on the merged code** (seed the precondition if the requirement
   needs data that prod can't safely hold). Capture screenshot + clip + each
   asserting checkpoint.
3. **Blind-audit against the requirement** — an independent pass told *only* the
   requirement text, which must find the pixels proving every clause or it FAILs.
   Same gate as a fix's AFTER; here it guards the acceptance, not the cure. A
   one-clause-short ship is `partially meets`, not `meets`.
4. **Verdict** — one of: `meets` · `partially meets` · `misses` · `not reachable`.
5. **Route it** per PRESENT's two-cuts rule: `meets` → the stakeholder gets the
   ✓-clip; anything else → author + owner first, privately, before the stakeholder
   sees it.

**Staging the merged code is the real cost** (lived). To run an *already-merged*
change locally without disturbing your working branch: worktree off `main`, share
`node_modules` by symlink, copy a seeded DB, run dev on its own port. And for a
**data / logging / state** behaviour, the cleanest evidence is to **trigger it
through the merged API** (an authenticated request) and screenshot the *rendered*
result — far more reliable than driving the UI form, and it still proves both the
server behaviour and the rendered wording. Dismiss any onboarding overlay first; it
will sit right over your proof.

The earned-place test for verify mode: a change is only called "done for the client"
with a same-requirement capture on disk that a blind audit passed — never on the dev's
"it's merged and green."

## Proof gates (hard — these are the whole point)

| Gate | Why |
|---|---|
| No `proven fixed` without an AFTER capture paired to a real BEFORE | the loop's entire value is the symmetry; a one-sided "looks fixed" is the failure mode it exists to kill |
| Identical capture spec both sides | different camera = void comparison, you've proven nothing |
| You personally inspect the AFTER frames | aggregate "tests pass" is the start of verification, not the end — read the actual pixels |
| AFTER includes unchanged-checkpoint regression guards | a fix that breaks the neighbour isn't a fix |
| AFTER is on the user-reachable surface, not an orphan component | a clean AFTER on a component nothing renders proves a fix the user never sees |
| VERIFY: no "done for the client" without a same-requirement capture a blind audit passed | "looks done" to the dev is exactly what acceptance evidence exists to replace |
| VERIFY: a gap reaches the author before the stakeholder | a half-met verdict handed straight to the client is a trust fire |

The earned-place test for this skill: if a session could close a bug as fixed
*without* a same-spec before/after pair on disk, fixer wasn't used.
