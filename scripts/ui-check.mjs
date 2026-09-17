/**
 * Drives the real UI in a browser and reports console errors, page errors and
 * failed requests. Used to catch client-side faults that server-side rendering
 * checks cannot see, and to capture screenshots for visual review.
 *
 *   node scripts/ui-check.mjs [--headed] [--shot-dir <dir>]
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Pick up SEED_ADMIN_PASSWORD from .env so credentials stay out of this file.
try {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {
  /* .env is optional when the variables are already exported */
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const USER = process.env.UI_USER ?? 'ERP_Admin'
const PASS = process.env.UI_PASS ?? process.env.SEED_ADMIN_PASSWORD
if (!PASS) {
  console.error('Set UI_PASS (or SEED_ADMIN_PASSWORD) before running the UI check.')
  process.exit(1)
}

const shotDir = resolve(
  process.argv.includes('--shot-dir')
    ? process.argv[process.argv.indexOf('--shot-dir') + 1]
    : 'ui-shots',
)
mkdirSync(shotDir, { recursive: true })

const problems = []
const seen = new Set()

function record(kind, text, where) {
  // React logs the same warning on every render; one line each is enough.
  const key = `${kind}:${text.slice(0, 160)}`
  if (seen.has(key)) return
  seen.add(key)
  problems.push({ kind, text: text.slice(0, 600), where })
}

const IGNORE = [
  'Download the React DevTools',
  'Fast Refresh',
  '[Fast Refresh]',
  'react-devtools',
]

async function main() {
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } })
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    const text = msg.text()
    if (IGNORE.some((i) => text.includes(i))) return
    record(msg.type() === 'error' ? 'console.error' : 'console.warn', text, page.url())
  })
  page.on('pageerror', (error) => record('pageerror', error.message, page.url()))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? ''
    if (failure.includes('ERR_ABORTED')) return
    record('requestfailed', `${request.method()} ${request.url()} — ${failure}`, page.url())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      record('http', `${response.status()} ${response.url()}`, page.url())
    }
  })

  const step = async (name, fn) => {
    process.stdout.write(`  ${name.padEnd(46)}`)
    try {
      await fn()
      await page.screenshot({
        path: `${shotDir}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
        fullPage: false,
      })
      console.log('ok')
    } catch (error) {
      console.log(`FAILED — ${error.message.split('\n')[0]}`)
      record('step', `${name}: ${error.message.split('\n')[0]}`, page.url())
    }
  }

  console.log(`\nDriving ${BASE}\n`)

  // --- Sign in -------------------------------------------------------------
  await step('login page', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#username')
    // Wait for hydration before typing: clicking submit on a form React has
    // not taken over yet triggers a native browser submit.
    await page.waitForFunction(
      () => document.querySelector('form')?.hasAttribute('data-hydrated') ?? false,
      { timeout: 20000 },
    )
  })

  let companyId
  let createdUserStamp = null

  await step('sign in', async () => {
    await page.fill('#username', USER)
    await page.fill('#password', PASS)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/c\/|\/select-company/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')

    // One company redirects straight through; several land on the picker.
    // Going via the root makes both paths converge on a company pipeline.
    if (!/\/c\//.test(page.url())) {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    }
    if (!/\/c\//.test(page.url())) {
      const card = page.locator('button:has-text("Open pipeline")').first()
      await card.waitFor({ timeout: 15000 })
      await card.click()
      await page.waitForURL(/\/c\//, { timeout: 30000 })
    }
    await page.waitForLoadState('networkidle')
    companyId = /\/c\/([^/]+)/.exec(page.url())?.[1]
    if (!companyId) throw new Error(`no company reached — landed on ${page.url()}`)
  })

  if (!companyId) {
    console.log('\nCould not reach a company pipeline — is a company set up?\n')
    await browser.close()
    process.exitCode = 1
    return
  }

  // --- Pipeline ------------------------------------------------------------
  await step('pipeline loads', async () => {
    await page.goto(`${BASE}/c/${companyId}/pipeline`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table thead th', { timeout: 20000 })
    const headers = await page.$$eval('table thead th', (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean),
    )
    if (headers.length < 17) throw new Error(`only ${headers.length} headers rendered`)
  })

  await step('grid uses full width (no sidebar)', async () => {
    const box = await page.locator('table').boundingBox()
    const viewport = page.viewportSize()
    if (!box) throw new Error('no table')
    if (box.x > 40) throw new Error(`table starts at x=${Math.round(box.x)} — sidebar still present?`)
    console.log('')
    console.log(`     table x=${Math.round(box.x)} width available=${viewport.width - box.x}px`)
    process.stdout.write(`  ${''.padEnd(46)}`)
  })

  // --- Column filters ------------------------------------------------------
  await step('open Status column filter', async () => {
    await page.hover('table thead th:nth-child(7)')
    await page.click('button[aria-label="Filter Status"]')
    await page.waitForSelector('[role=dialog], [data-radix-popper-content-wrapper]', {
      timeout: 5000,
    })
    await page.waitForTimeout(400)
  })

  await step('select a status value', async () => {
    const option = page.locator('[data-radix-popper-content-wrapper] button').filter({
      hasText: /Won|Quoted|Pending|Lost/,
    })
    await option.first().click()
    await page.waitForTimeout(1200)
  })

  await step('close filter popover', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  })

  await step('filtered grid + chip', async () => {
    await page.waitForLoadState('networkidle')
    const url = page.url()
    if (!/status=/.test(url)) throw new Error(`filter did not reach the URL: ${url}`)
  })

  await step('clear all filters', async () => {
    const clear = page.locator('button', { hasText: 'Clear all filters' })
    if (await clear.count()) {
      await clear.first().click()
      await page.waitForTimeout(900)
    }
  })

  await step('search box', async () => {
    await page.fill('input[aria-label="Search the pipeline"]', 'a')
    await page.waitForTimeout(1200)
    await page.fill('input[aria-label="Search the pipeline"]', '')
    await page.waitForTimeout(900)
  })

  // --- Date filter presets -------------------------------------------------
  await step('date filter presets', async () => {
    await page.hover('table thead th:nth-child(3)')
    await page.click('button[aria-label="Filter Enquiry Date"]')
    await page.waitForTimeout(400)
    const preset = page.locator('[data-radix-popper-content-wrapper] button', {
      hasText: 'This month',
    })
    await preset.first().click()
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    if (!/enquiryDateFrom=/.test(page.url())) {
      throw new Error(`preset did not apply: ${page.url()}`)
    }
  })

  await step('clear date filter', async () => {
    const clear = page.locator('button', { hasText: 'Clear all filters' })
    if (await clear.count()) {
      await clear.first().click()
      await page.waitForTimeout(900)
    }
  })

  // --- Add request drawer --------------------------------------------------
  await step('open Add Request drawer', async () => {
    await page.click('button:has-text("Add Request")')
    await page.waitForSelector('text=Add request', { timeout: 8000 })
    await page.waitForTimeout(700)
  })

  await step('inline customer create asks for contact details', async () => {
    await page.click('button:has-text("Search or add a customer")')
    await page.waitForTimeout(400)
    await page.keyboard.type('Zebra Test Contracting')
    await page.waitForTimeout(500)
    await page.click('button:has-text("as a new customer")')
    await page.waitForSelector('text=New customer', { timeout: 8000 })
    // The point of the dialog: email and phone, not just a name.
    await page.waitForSelector('input[type=email]', { timeout: 5000 })
    const labels = await page.$$eval('label', (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean),
    )
    for (const needed of ['Email', 'Phone']) {
      if (!labels.some((label) => label?.startsWith(needed))) {
        throw new Error(`${needed} field missing from the create dialog`)
      }
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  await step('unsaved changes uses an in-app dialog', async () => {
    // A native confirm() would block Playwright and auto-dismiss; assert the
    // styled dialog is what appears.
    let nativeDialogFired = false
    page.once('dialog', (dialog) => {
      nativeDialogFired = true
      void dialog.dismiss()
    })

    await page.fill('#enquiry-project-name', 'Dirty state')
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)

    if (nativeDialogFired) throw new Error('a native browser confirm() was used')
    await page.waitForSelector('text=Discard your changes?', { timeout: 5000 })
    await page.click('button:has-text("Keep editing")')
    await page.waitForTimeout(500)
  })

  await step('close drawer', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    const discard = page.locator('button:has-text("Discard changes")')
    if (await discard.count()) {
      await discard.first().click()
      await page.waitForTimeout(600)
    }
  })

  // --- Other screens -------------------------------------------------------
  for (const [name, path] of [
    ['delete requests', `/c/${companyId}/delete-requests`],
    ['customers', `/c/${companyId}/customers`],
    ['audit', `/c/${companyId}/audit`],
    ['dropdown settings', `/c/${companyId}/admin/dropdowns`],
    ['users admin', `/admin/users`],
    ['companies admin', `/admin/companies`],
  ]) {
    await step(name, async () => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(500)
    })
  }

  await step('create a user end to end', async () => {
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' })
    await page.click('button:has-text("New user")')
    await page.waitForSelector('text=Create user', { timeout: 8000 })

    // No display-code field: it is derived from the name.
    const labels = await page.$$eval('label', (els) => els.map((el) => el.textContent?.trim()))
    if (labels.some((label) => label?.startsWith('Display code'))) {
      throw new Error('display code is still asked for')
    }

    const stamp = Date.now().toString(36).slice(-5)
    await page.fill('#user-name', `Zed Tester ${stamp}`)
    await page.fill('#user-username', `zed${stamp}`)
    await page.fill('#user-email', `zed.${stamp}@example.com`)
    await page.fill('#user-password', 'Test123456')

    // Submit with no company assigned: the failure must be stated, not silent.
    await page.click('button:has-text("Create user")')
    await page.waitForTimeout(1500)
    const banner = page.locator('[role=alert]')
    if ((await banner.count()) === 0) {
      throw new Error('no visible error when the form was incomplete')
    }
    const bannerText = (await banner.first().innerText()).toLowerCase()
    if (!bannerText.includes('company')) {
      throw new Error(`error banner did not explain the problem: ${bannerText.slice(0, 80)}`)
    }

    // Now assign a company and save for real. The option row carries both the
    // company name and its short code.
    await page.locator('button').filter({ hasText: /^AWS Distribution$/ }).first().click()
    await page.waitForTimeout(500)
    await page.click('button:has-text("Create user")')
    await page.waitForTimeout(2500)

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' })
    const created = page.locator(`text=Zed Tester ${stamp}`)
    await created.first().waitFor({ timeout: 10000 })
    createdUserStamp = stamp
  })

  await step('customer edit dialog', async () => {
    await page.goto(`${BASE}/c/${companyId}/customers`, { waitUntil: 'networkidle' })
    const card = page.locator('article').first()
    await card.waitFor({ timeout: 10000 })
    await card.hover()
    await page.waitForTimeout(300)
    await card.locator('button[aria-label^="Edit"]').first().click()
    await page.waitForSelector('text=Edit customer', { timeout: 8000 })
    const value = await page.inputValue('input[maxlength="200"]')
    if (!value) throw new Error('edit dialog did not prefill the customer name')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  await step('automation rules tab', async () => {
    await page.goto(`${BASE}/c/${companyId}/admin/dropdowns`, { waitUntil: 'networkidle' })
    await page.click('button:has-text("Automation")')
    await page.waitForTimeout(700)
  })

  await browser.close()

  // --- Report --------------------------------------------------------------
  console.log(`\nScreenshots: ${shotDir}`)
  if (problems.length === 0) {
    console.log('\nNo console errors, page errors or failed requests.\n')
    return
  }

  console.log(`\n${problems.length} problem(s):\n`)
  for (const p of problems) {
    console.log(`  [${p.kind}] ${p.text}`)
    console.log(`     at ${p.where}\n`)
  }
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
