#!/usr/bin/env node
/**
 * proofloop before/after assembler.
 *
 * Pairs the BEFORE and AFTER captures of a case (same checkpoint labels) into
 * the proof artifacts:
 *   - per-checkpoint side-by-side PNG  (before | after, labelled)
 *   - a before→after GIF per checkpoint (wipe between the two states)
 *   - compare.html — a slider page over every checkpoint, publishable to xr2.au
 *
 * It does NOT capture anything — playwright-cli / walkabout's record-demo.mjs do
 * that. This only stitches what's already on disk, so it works for any app.
 *
 * Layout it expects (the case dir):
 *   <case>/before/<label>.png
 *   <case>/after/<label>.png        (same <label>s as before/)
 * Produces:
 *   <case>/compare/<label>.side.png
 *   <case>/compare/<label>.gif
 *   <case>/compare/compare.html
 *
 * Usage:  node compare.mjs <case-dir> [--gap=24] [--label-h=40]
 * Needs:  ffmpeg on PATH.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const caseDir = process.argv[2];
if (!caseDir) { console.error('usage: node compare.mjs <case-dir>'); process.exit(1); }
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split('=')[1] : d;
};
const GAP = parseInt(arg('gap', '24'), 10);       // px gutter between the two panes
const LABEL_H = parseInt(arg('label-h', '40'), 10); // px band for the BEFORE/AFTER caption

const beforeDir = path.join(caseDir, 'before');
const afterDir = path.join(caseDir, 'after');
const outDir = path.join(caseDir, 'compare');
fs.mkdirSync(outDir, { recursive: true });

const labels = fs.readdirSync(beforeDir)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .map((f) => f.replace(/\.png$/i, ''))
  .filter((l) => fs.existsSync(path.join(afterDir, `${l}.png`)))
  .sort();

if (!labels.length) {
  console.error(`No paired checkpoints. Need matching <label>.png in ${beforeDir} and ${afterDir}.`);
  process.exit(1);
}

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

for (const label of labels) {
  const b = path.join(beforeDir, `${label}.png`);
  const a = path.join(afterDir, `${label}.png`);
  const side = path.join(outDir, `${label}.side.png`);
  const gif = path.join(outDir, `${label}.gif`);

  // Side-by-side: scale both to a common height, caption each, hstack with a gutter.
  // drawtext bands BEFORE (red) and AFTER (green) so the proof reads at a glance.
  ff([
    '-i', b, '-i', a,
    '-filter_complex',
    `[0:v]scale=-2:720,pad=iw:ih+${LABEL_H}:0:${LABEL_H}:white,` +
      `drawtext=text='BEFORE':x=(w-tw)/2:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=0xC0392B:boxborderw=10[bl];` +
    `[1:v]scale=-2:720,pad=iw:ih+${LABEL_H}:0:${LABEL_H}:white,` +
      `drawtext=text='AFTER':x=(w-tw)/2:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=0x1E8449:boxborderw=10[al];` +
    `[bl][al]hstack=inputs=2:shortest=1,pad=iw+${GAP}:ih:${GAP / 2}:0:white`,
    side,
  ]);

  // Before→after GIF: 1.2s on each state, hard cut. Small, loops, drops into chat/issues.
  ff([
    '-loop', '1', '-t', '1.2', '-i', b,
    '-loop', '1', '-t', '1.2', '-i', a,
    '-filter_complex',
    `[0:v]scale=900:-2[b];[1:v]scale=900:-2[a];[b][a]concat=n=2:v=1:a=0,` +
      `split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`,
    gif,
  ]);
  console.log(`✓ ${label}`);
}

// compare.html — a checkpoint slider. before/after stacked per checkpoint, with a
// drag handle. Self-contained (inlines image paths relative to compare/), so it
// publishes straight to pagedrop / xr2.au.
const rel = (p) => path.relative(outDir, p).split(path.sep).join('/');
const cards = labels.map((label) => `
  <section class="cp">
    <h2>${label}</h2>
    <div class="ba" style="--p:50%">
      <img class="after" src="${rel(path.join(afterDir, `${label}.png`))}" alt="after ${label}">
      <img class="before" src="${rel(path.join(beforeDir, `${label}.png`))}" alt="before ${label}">
      <input type="range" min="0" max="100" value="50" aria-label="reveal ${label}">
      <span class="tag b">BEFORE</span><span class="tag a">AFTER</span>
    </div>
    <img class="gif" src="${label}.gif" alt="${label} before to after" loading="lazy">
  </section>`).join('\n');

const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>proofloop — ${path.basename(caseDir)}</title>
<style>
  :root{--c-b:#C0392B;--c-a:#1E8449}
  body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0e0f13;color:#e8e9ec}
  header{padding:24px;border-bottom:1px solid #23252c}
  h1{margin:0;font-size:20px} header p{margin:4px 0 0;color:#9aa0aa;font-size:14px}
  .cp{padding:24px;max-width:1100px;margin:0 auto}
  h2{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#9aa0aa}
  .ba{position:relative;overflow:hidden;border-radius:10px;border:1px solid #23252c;line-height:0}
  .ba img{width:100%;display:block}
  .ba .before{position:absolute;inset:0;clip-path:inset(0 0 0 var(--p))}
  .ba input{position:absolute;inset:auto 0 12px;width:calc(100% - 24px);margin:0 12px;cursor:ew-resize}
  .tag{position:absolute;top:10px;padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700;color:#fff}
  .tag.b{right:10px;background:var(--c-b)} .tag.a{left:10px;background:var(--c-a)}
  .gif{width:100%;margin-top:12px;border-radius:10px;border:1px solid #23252c}
</style>
<header><h1>proofloop — ${path.basename(caseDir)}</h1>
<p>Drag each slider: left edge is AFTER, right edge is BEFORE. GIF below cuts between the two.</p></header>
${cards}
<script>
for(const r of document.querySelectorAll('.ba input')){
  const set=()=>r.closest('.ba').style.setProperty('--p',r.value+'%');
  r.addEventListener('input',set); set();
}
</script>`;
fs.writeFileSync(path.join(outDir, 'compare.html'), html);
console.log(`\n✓ ${labels.length} checkpoint(s) → ${path.join(outDir, 'compare.html')}`);
console.log('  Publish: pagedrop the compare/ dir, or open compare.html locally.');
