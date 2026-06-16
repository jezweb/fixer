# proofloop

Catch a bug red-handed on camera, fix it, then prove it's dead on the **same
camera**. A closed loop that returns before/after visual evidence — screenshots,
GIF, video — plus a written verdict per issue. A bug is fixed when the capture
that caught it misbehaving now shows it behaving, same viewport, same steps, same
checkpoints. Not when the tests went green.

```
SCOPE → PROVE-BEFORE → DIAGNOSE → FIX → PROVE-AFTER → PRESENT → (loop)
        the indictment           root cause           the acquittal
```

## For the agent

The skill (`skills/proofloop/SKILL.md`) is the method; read it first. proofloop
**owns** the case-file contract (`templates/case-file.md`) and the before/after
assembler (`templates/compare.mjs`), and **borrows** everything else — capture from
playwright-cli and walkabout's recorder, stitching from ffmpeg, discovery from the
github/google-chat MCPs, iteration from the self-refining loop. Don't build a second
capture engine here. The deep reference and rationale live in `docs/pattern.md`.

The non-negotiable: no case closes as `proven fixed` without a real BEFORE and an
AFTER captured from the **same** repro spec, paired on disk.

## Pieces

| File | Role |
|---|---|
| `skills/proofloop/SKILL.md` | the loop, the proof gates, what to borrow |
| `templates/case-file.md` | per-issue evidence bundle (the contract) |
| `templates/compare.mjs` | pairs before/after into side-by-side PNGs, GIFs, and a `compare.html` slider (needs ffmpeg) |
| `docs/pattern.md` | design rationale, capture notes, adopters |

## Family

Sibling of [walkabout](https://github.com/jezweb/walkabout) (the camera it borrows)
and the self-refining loop (the iteration it borrows).
