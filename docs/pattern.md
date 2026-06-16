# fixer — design rationale and deep reference

## Why it exists

The family already had the pieces but not the loop that joins them:

- **walkabout** captures (scripted page walks, narrated video) — a *camera*.
- **self-refining loop / ralph-loop** iterate until done — a *loop engine*.
- **ux-audit** finds what's broken — a *discovery engine*.
- **verify-visually** checks one change once — a *single shot*.

None of them do the symmetric **prove-it-broken → fix → prove-it-fixed** cycle,
and none start from "go read the issues and the chat and find the candidates".
fixer is the composition layer that does, and its output is *evidence* — a
before/after pair on the same capture spec — not an assertion that it's fixed.

## The one idea: evidence symmetry

The capture that catches the bug misbehaving is re-run, unchanged, after the fix.
Same viewport, same steps, same checkpoint labels. Only the behaviour differs. It
is the visual equivalent of a red test you turn green: the red run and the green
run exercise the identical thing. Break the symmetry (different viewport, extra
step, relabelled checkpoint) and the comparison proves nothing.

This is why the **repro spec** (`spec.json` in the case file) is the spine: BEFORE
and AFTER are two runs of one spec, and `compare.mjs` pairs them by checkpoint label.

## What fixer owns vs borrows

Owns (lives here): the **case-file contract**, the **before/after assembler**
(`compare.mjs`), and the **CDP recorder** (`record-cdp.example.mjs`) — bundled so the
video leg needs no walkabout install. These are the genuinely-new parts.

Borrows (do not duplicate): stills + DOM snapshots (playwright-cli), GIF/video
stitching (ffmpeg), discovery (github + google-chat MCPs, console/network, ux-audit),
iteration (the loop skills), sharing (pagedrop → xr2.au). For moving video, use the
bundled `record-cdp` recorder (CDP `Page.startScreencast` → JPEG → ffmpeg, *not*
Playwright `recordVideo` — it shimmers or writes 0-byte files; lived: 0 bytes every run).

If you find yourself writing a *new* capture engine here, stop — adapt the bundled
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

- **Auth**: reuse a Playwright `storageState` JSON (gitignore it), or — faster for
  cookie/token stacks — POST the app's sign-in endpoint via `context.request`, which
  shares the page cookie jar so one call logs in and the capture starts on the bug.
- **Determinism**: role-based locators, fixed viewport, explicit waits on a settled
  selector (not arbitrary sleeps), so the two runs line up frame-for-frame.
- **Responsive bugs**: add each breakpoint as its own checkpoint set in the spec.
- **Stills**: cap at 1440px (`sips -Z 1440`) before re-reading, per the screenshot rule.

## Storage

Per project: `<project>/.jez/fixer/<slug>/` holding `case.md`, `spec.json`,
`before/`, `after/`, `compare/`. Commit the markdown + spec; gitignore the binaries
(`before/`, `after/`, `compare/*.png`, `*.gif`, `*.mp4`).

## Capture environment — live vs local-seeded

The SKILL says reproduce on the **live** app. Add one branch: when a bug needs a
**precondition you can't safely stage on production** — an FK-linked record, a
patient with a related carer row, a survey token, anything requiring a write — use
a **local seeded dev DB** instead, and pin the seed so AFTER replays against the
same data. Live prod is right for read-only-observable bugs; local-seeded is right
when (a) repro requires mutating data, or (b) prod holds real PHI / can't be dirtied.

Don't assume local can't reproduce "deploy-class" DB failures: a local Cloudflare
D1 (`wrangler … --local`) reports `PRAGMA foreign_keys = 1`, so **FK-constraint
bugs DO reproduce locally**. (That's distinct from the raw-`BEGIN TRANSACTION`
class, which local SQLite honours but remote D1 rejects — those stay deploy-blind.)

## Gotchas earned

Worked example in `templates/capture-before.example.mjs`. Each cost real time once.

1. **ESM resolution** — `node` resolves a bare `import 'playwright'` from the
   *script's own folder*, not your cwd. A capture script in `/tmp` throws
   `ERR_MODULE_NOT_FOUND` even when run from the app. Keep the runner inside the
   host app (resolves its `node_modules`), or import by absolute path.
2. **Skip the login form** — `context.request.post('/api/auth/sign-in/email', …)`
   shares the cookie jar with every page in that context. One API call logs in;
   no flaky form-driving, and the video starts on the actual bug, not on sign-in.
3. **Hidden responsive twins** — lists render a desktop `<table>` *and* hidden
   mobile cards with the same text; `getByText(name)` grabbed the hidden span.
   Scope to `getByRole('table')`.
4. **shadcn `AlertDialog` has `role="dialog"`, not `"alertdialog"`** —
   `getByRole('alertdialog')` matches nothing. Target the dialog generically, or
   the action button by its unique class.
5. **Modal stacking** — an app can mount two dialogs at once (here a buggy
   `onRowClick` opened Edit *over* the Delete confirmation and intercepted the
   click). Don't pick buttons by position/structure ("last non-Cancel"); target a
   unique class (`button.bg-destructive`) and dismiss overlays with a deterministic
   `Escape`. Bonus: filming the real flow *surfaced* that propagation bug.
6. **Capture the failing network body** — logging `page.waitForResponse(DELETE)`
   yielded `500 {"error":"Failed to delete surgeon"}`, which named the mechanism
   (FK 500 → generic toast) far better than the screenshot. Add the failing
   response body to the indictment, not just the pixels.

## The video leg — a self-contained recorder (`templates/record-cdp.example.mjs`)

Confirmed the SKILL's "never Playwright `recordVideo`": on a headless run it wrote
**0-byte `.webm` files** every time. The SKILL's other suggestion — *borrow
walkabout's `record-demo.mjs`* — assumes walkabout is installed in the host app,
and most aren't. So fixer now ships its **own** recorder.

It uses the **same technique walkabout does** — Chrome DevTools
`Page.startScreencast` → timestamped JPEG frames → ffmpeg, variable frame-rate, no
shimmer — minus the narration mux (fixer records a scripted journey, not a
narrated tour). `createRecorder(context, page, framesDir)` returns `{ start, stop,
assemble }`; a mouse-jiggle heartbeat keeps frames flowing through static moments
(screencast only emits on repaint). Verified in practice: 83 frames → a 6.4s 1440×900
MP4 with the failure visible in the closing frames.

The **GIF-from-checkpoint-stills** path is still the cheap fallback for the
animated-GIF leg when you don't need motion:
`ffmpeg -framerate 0.7 -pattern_type glob -i 'shots/0*.png' -vf "…palettegen…paletteuse" before.gif`.

## Adopters

- **A Cloudflare Workers + React 19 + Hono + D1 app** (anonymised adopter) — first PROVE-BEFORE
  capture: a surgeon-delete case, "admin can't delete a surgeon," proven to be an FK
  constraint (`DELETE /api/surgeons/:id` → `500 {"error":"Failed to delete surgeon"}`)
  surfacing as a generic toast, *not* a permissions bug. Captured on local seeded
  dev (FK enforced locally). Surprises: all six gotchas above, plus `recordVideo`
  writing 0-byte files — which is what prompted the bundled CDP recorder. Full
  artifact set produced: 6 checkpoint stills + GIF + a 6.4s screen-video (MP4)
  showing the failure, all from one local-seeded run.
