// fixer — PROVE-BEFORE capture (worked example)
//
// A real, working indictment capture from a Cloudflare Workers +
// React 19 + Hono + D1 app. It films a CRUD-delete bug — "admin can't delete a
// surgeon" — which is actually a foreign-key constraint surfacing as a generic
// error toast. Transplant and adapt; the inline comments are the gotchas that
// cost real time, kept so the next adopter doesn't re-pay them.
//
// Produces: labelled checkpoint screenshots in <OUT>/shots and console/network
// evidence on stdout. (For the video half, see the recorder note in docs/pattern.md
// — Playwright recordVideo wrote 0-byte files here; use a CDP screencast recorder.)
//
// GOTCHA 0 — ESM resolution. `node` resolves a bare `import 'playwright'` from the
// SCRIPT's own folder, NOT your cwd. A script in /tmp throws ERR_MODULE_NOT_FOUND
// even when you run it from the app dir. Keep this file inside the host app (so it
// resolves app/node_modules), or import playwright by absolute path / createRequire.
import { chromium } from 'playwright'

const BASE = process.env.FIXER_BASE || 'http://localhost:5173'
const OUT = process.env.FIXER_OUT || '/tmp/fixer-run/<slug>'
const VIEW = { width: 1440, height: 900 } // fixed viewport — AFTER must match exactly
// GOTCHA 1 — auth. Don't drive the sign-in FORM (flaky). Most modern stacks
// (better-auth, etc.) expose an email/password endpoint. `context.request` shares
// the SAME cookie jar as pages in that context, so one API POST logs in every page.
const CRED = { email: process.env.FIXER_EMAIL, password: process.env.FIXER_PASSWORD }
const SIGNIN_PATH = '/api/auth/sign-in/email'
const TARGET = process.env.FIXER_TARGET || 'Dr Example Surgeon' // a row known to fail

const log = (...a) => console.log('[capture]', ...a)
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/shots/${name}.png` }); log('shot', name) }

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: VIEW })
context.on('console', (m) => { if (m.type() === 'error') log('console.error:', m.text()) })

const signin = await context.request.post(`${BASE}${SIGNIN_PATH}`, {
  data: CRED, headers: { 'content-type': 'application/json' },
})
log('sign-in', signin.status())
if (!signin.ok()) { log('AUTH FAILED', await signin.text()); await browser.close(); process.exit(1) }

const page = await context.newPage()
const netFails = []
page.on('response', (r) => { if (r.status() >= 400) netFails.push(`${r.status()} ${r.request().method()} ${r.url()}`) })

// 01 — the scene. waitUntil networkidle + an explicit wait on settled content.
await page.goto(`${BASE}/dashboard/surgeons`, { waitUntil: 'networkidle' })
// GOTCHA 2 — hidden responsive twins. Lists often render BOTH a desktop <table>
// AND hidden mobile cards carrying the same text; getByText() grabbed the hidden
// mobile span. Scope to the table (role=table) so locators hit the visible row.
const table = page.getByRole('table')
await table.getByText(TARGET).first().waitFor({ timeout: 15000 })
await shot(page, '01-list-loaded')

// 02 — open the row's ••• action menu (its sr-only label here is "Open menu").
const row = table.getByRole('row', { name: new RegExp(TARGET) }).first()
let menuBtn = row.getByRole('button', { name: /open menu/i })
if (!(await menuBtn.count())) menuBtn = row.getByRole('button').last()
await menuBtn.click()
await page.waitForTimeout(400)
await shot(page, '02-action-menu')

// 03 — click Delete. Use exact:true so a /delete/i regex doesn't fuzzy-match.
await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(500)
await shot(page, '03-confirm-dialog')

// GOTCHA 3 — modal stacking. This app's table wires onRowClick=edit AND the •••
// lives inside the row, so opening the menu ALSO opens an Edit dialog that overlays
// the Delete confirmation and intercepts the click. (That bubbling is itself a real
// bug the capture surfaced.) Dismiss the topmost overlay deterministically:
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// 04 — confirm the destructive action and CAPTURE THE FAILING RESPONSE BODY.
// GOTCHA 4 — shadcn alert-dialog renders role="dialog", NOT "alertdialog", so
// getByRole('alertdialog') finds nothing. And with two dialogs mounted, "last
// non-Cancel button" is ambiguous — target the unique destructive class instead.
const delResp = page.waitForResponse(
  (r) => r.url().includes('/surgeons/') && r.request().method() === 'DELETE',
  { timeout: 9000 },
).catch(() => null)
await page.locator('button.bg-destructive').first().click()
const resp = await delResp
// The network body is the mechanism — far better evidence than the toast alone.
if (resp) log('DELETE', resp.status(), (await resp.text().catch(() => '')).slice(0, 120))
const toast = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: /fail|error|cannot/i }).first()
const toastText = await toast.textContent({ timeout: 8000 }).catch(() => '(no toast)')
await shot(page, '04-error-state')

await context.close()
await browser.close()
console.log('\n== EVIDENCE ==')
console.log('toast        :', (toastText || '').trim())
console.log('network>=400 :', netFails.join(' | ') || 'none')
console.log('shots in     :', `${OUT}/shots`)

// THEN: build the GIF from the labelled stills (works even with no video):
//   ffmpeg -y -framerate 0.7 -pattern_type glob -i 'shots/0*.png' \
//     -vf "scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" before.gif
