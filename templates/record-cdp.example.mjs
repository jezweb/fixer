// fixer — CDP screencast recorder (the video leg). Self-contained: no
// walkabout dependency. SAME technique walkabout's record-demo.mjs uses —
// Chrome DevTools `Page.startScreencast` → timestamped JPEG frames → ffmpeg
// (variable frame-rate, no shimmer) — NOT Playwright `recordVideo`, which wrote
// 0-byte files in testing. Difference vs walkabout: no narration mux, just the
// scripted journey → MP4 + GIF.
//
// Verified in practice: 83 frames → 6.4s 1440x900 MP4, the DELETE 500
// firing mid-recording and the error toast visible in the final frames.
//
// Run from inside the host app (ESM resolves `playwright` from its node_modules).
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BASE = process.env.FIXER_BASE || 'http://localhost:5173'
const OUT = process.env.FIXER_OUT || '/tmp/fixer-run/<slug>'
const VIEW = { width: 1440, height: 900 } // fixed; AFTER must match for a valid compare
const CRED = { email: process.env.FIXER_EMAIL, password: process.env.FIXER_PASSWORD }

// ── reusable recorder ──────────────────────────────────────────────────────
// createRecorder(page) → { start, stop, assemble }. Frames stream while active;
// a mouse-jiggle heartbeat keeps frames flowing during static moments (screencast
// only emits on repaint).
async function createRecorder(context, page, framesDir) {
  rmSync(framesDir, { recursive: true, force: true }); mkdirSync(framesDir, { recursive: true })
  const client = await context.newCDPSession(page)
  const frames = []; let n = 0; let beat = null
  client.on('Page.screencastFrame', async (e) => {
    const file = `${framesDir}/f${String(++n).padStart(5, '0')}.jpg`
    writeFileSync(file, Buffer.from(e.data, 'base64'))
    frames.push({ t: e.metadata.timestamp, file })
    try { await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }) } catch {}
  })
  return {
    async start() {
      await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
      beat = setInterval(() => page.mouse.move(2, 2).catch(() => {}), 120)
    },
    async stop() { clearInterval(beat); await client.send('Page.stopScreencast') },
    // variable-rate concat → mp4 (yuv420p, even dims), then mp4 → gif
    assemble(mp4, gif) {
      if (frames.length < 2) throw new Error('too few frames — did the journey run?')
      let list = ''
      for (let i = 0; i < frames.length; i++) {
        const dur = (i < frames.length - 1 ? frames[i + 1].t : frames[i].t + 0.2) - frames[i].t
        list += `file '${frames[i].file}'\nduration ${Math.max(0.04, dur).toFixed(3)}\n`
      }
      list += `file '${frames[frames.length - 1].file}'\n`
      writeFileSync(`${framesDir}/list.txt`, list)
      execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `${framesDir}/list.txt`,
        '-vsync', 'vfr', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', mp4], { stdio: 'ignore' })
      if (gif) execFileSync('ffmpeg', ['-y', '-i', mp4, '-vf',
        'fps=10,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', gif], { stdio: 'ignore' })
      return frames.length
    },
  }
}

// ── run: auth, record the journey, assemble ────────────────────────────────
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: VIEW })
const signin = await context.request.post(`${BASE}/api/auth/sign-in/email`,
  { data: CRED, headers: { 'content-type': 'application/json' } })
if (!signin.ok()) { console.error('AUTH FAILED', await signin.text()); await browser.close(); process.exit(1) }
const page = await context.newPage()
const rec = await createRecorder(context, page, `${OUT}/frames`)

// ===== ADAPT THIS BLOCK: your journey. Pace actions (~0.7–1.8s holds) so motion
// reads on camera. Start recording AFTER the first settled paint. =====
await page.goto(`${BASE}/dashboard/surgeons`, { waitUntil: 'networkidle' })
const table = page.getByRole('table')
await table.getByText('Dr Example Surgeon').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(600)
await rec.start()
await page.waitForTimeout(900)
const row = table.getByRole('row', { name: /Dr Example Surgeon/ }).first()
let menu = row.getByRole('button', { name: /open menu/i }); if (!(await menu.count())) menu = row.getByRole('button').last()
await menu.click(); await page.waitForTimeout(900)
await page.getByRole('menuitem', { name: 'Delete', exact: true }).click(); await page.waitForTimeout(900)
await page.keyboard.press('Escape'); await page.waitForTimeout(700) // dismiss the overlaying Edit dialog
await page.locator('button.bg-destructive').first().click()
await page.waitForTimeout(1800) // hold on the failure
// =====================================================================
await rec.stop()
await context.close(); await browser.close()
const count = rec.assemble(`${OUT}/before.mp4`, `${OUT}/before.video.gif`)
console.log(`[record] ${count} frames → ${OUT}/before.mp4 + before.video.gif`)
