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

/*
 * Whether this run may write to the database it is driving.
 *
 * Off unless asked for, because this script is also pointed at the live system
 * by `npm run release`, and the steps that create a user or save an edit would
 * leave that data behind on every deploy. It is how two dozen throwaway
 * accounts once ended up in production.
 *
 * Point it at a local server with UI_ALLOW_WRITES=1 for the full set.
 */
const ALLOW_WRITES = process.env.UI_ALLOW_WRITES === '1'
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

  const skip = (name, why) => {
    console.log(`  ${name.padEnd(46)}skipped — ${why}`)
  }

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
      // A shot of the failure, not only of the successes: what the screen
      // looked like when a step gave up is the first thing worth seeing.
      await page
        .screenshot({
          path: `${shotDir}/FAILED-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
          fullPage: false,
        })
        .catch(() => {})
    }
  }

  console.log(`\nDriving ${BASE}${ALLOW_WRITES ? '' : '  (read-only)'}\n`)

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

  const PRODUCT = 'Pipeline Tracker'

  await step('browser tab is named for the product', async () => {
    const title = await page.title()
    if (title !== PRODUCT) throw new Error(`tab reads "${title}"`)
  })

  let companyId
  let companyName = null
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

    /*
     * Discovered, not hardcoded: later steps pick this company out of a list,
     * and naming one here would tie the check to one installation. The first
     * header button is the logo and has no text, so this takes the first one
     * that does - the company switcher, which reads "AD
AWS Distribution".
     */
    const headerLabels = await page.locator('header button').allInnerTexts()
    const switcher = headerLabels.map((text) => text.trim()).find(Boolean) ?? ''
    // Dropping the blank segments: the label ends with a newline, so taking
    // the last one straight off gives an empty string - which then matches
    // every button on the page.
    const parts = switcher.split('\n').map((part) => part.trim()).filter(Boolean)
    companyName = parts[parts.length - 1] ?? ''
    if (!companyName) throw new Error('could not read the company name from the header')
  })

  if (!companyId) {
    /*
     * A system with no company yet is a real state - it is what a fresh
     * installation looks like - so the run reports what it could check and
     * stops rather than failing. Anything that actually went wrong on the way
     * here is still reported below, which is why this falls through to the
     * report rather than returning from the middle of the run.
     */
    const text = await page.locator('body').innerText()
    const looksEmpty = /no companies yet/i.test(text)
    if (looksEmpty) {
      console.log('\n  No company exists yet - the pipeline checks were skipped.')
    } else {
      record(
        'step',
        'could not reach a pipeline, and this is not the empty state',
        page.url(),
      )
    }
    await browser.close()
    return report()
  }

  // --- Pipeline ------------------------------------------------------------
  await step('pipeline loads', async () => {
    await page.goto(`${BASE}/c/${companyId}/pipeline`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table thead th', { timeout: 20000 })
    const headers = await page.$$eval('table thead th', (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean),
    )
    // The business columns, in order, after the pinned actions column. Named
    // rather than counted: a count still passes when one column is swapped
    // for another.
    const EXPECTED = [
      'JOB NO',
      'Enquiry Date',
      'SALES RESPONSIBLE',
      'Customer Name',
      'Project Name',
      'STATUS',
      'LOCATION',
      'MATERIAL',
      'ENQUIRY DETAILS',
      'Quote Value',
      'PROBABILITY',
      'Exp Order Date',
      'Exp Billing Date',
      'EMAIL',
      'Contact Person',
      'PHONE NUMBER',
      'REMARKS',
    ]
    // Case-insensitive: the headers are uppercased in CSS, not in the text.
    const normalise = (list) => list.map((header) => header.toLowerCase()).join('|')
    const actual = headers.slice(1)
    if (normalise(actual) !== normalise(EXPECTED)) {
      throw new Error(`columns are ${actual.join(', ')}`)
    }
    if (headers.some((header) => /s\.?\s*no/i.test(header))) {
      throw new Error('the S.No column is still present')
    }
  })

  /*
   * Editing happens in the row, not in a panel. The panel is still how a
   * request is added, so this must not quietly become a drawer again.
   */
  await step('double-click edits the row in place', async () => {
    const row = page.locator('table tbody tr').first()
    await row.dblclick()
    await page.waitForSelector('button[aria-label="Save changes"]', { timeout: 8000 })
    await page.waitForTimeout(400)

    if (await page.locator('[role="dialog"]').count()) {
      throw new Error('a dialog opened instead of editing in place')
    }
    const editors = await row.locator('input, [role="combobox"]').count()
    if (editors < 10) throw new Error(`only ${editors} editors appeared in the row`)

    // Job No is issued by the server and the enquiry date records when the
    // request came in, so neither gets an editor.
    for (const [index, label] of [
      [1, 'Job No'],
      [2, 'Enquiry Date'],
    ]) {
      const cell = row.locator('td').nth(index)
      if (await cell.locator('input, textarea, [role="combobox"]').count()) {
        throw new Error(`${label} is editable and should not be`)
      }
    }

    // Enquiry details and Remarks hold paragraphs, so they edit as textareas
    // and Enter inserts a line rather than saving the row.
    const areas = await row.locator('textarea').count()
    if (areas < 2) {
      throw new Error(`expected Enquiry details and Remarks to be textareas, found ${areas}`)
    }
    const remarks = row.locator('textarea').last()
    await remarks.fill('first line')
    await remarks.press('Enter')
    await remarks.type('second line')
    const typed = await remarks.inputValue()
    if (!typed.includes('\n')) throw new Error('Enter did not insert a line break')
    if (!(await page.locator('button[aria-label="Save changes"]').count())) {
      throw new Error('Enter saved the row instead of inserting a line break')
    }
    await remarks.fill('')

    // By column, not by input index: which cells carry an editor changes as
    // fields become read-only, and an index quietly starts editing a
    // different field when it does.
    const PROJECT_NAME_CELL = 5
    const project = row.locator('td').nth(PROJECT_NAME_CELL).locator('input')

    if (!ALLOW_WRITES) {
      // Everything above is observation; saving is the one part that changes
      // the data, so read-only stops here and leaves the row as it found it.
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      return
    }

    const before = await project.inputValue()
    const after = before.endsWith(' *') ? before.slice(0, -2) : `${before} *`
    await project.fill(after)
    await page.click('button[aria-label="Save changes"]')
    await page.waitForSelector('button[aria-label="Save changes"]', {
      state: 'detached',
      timeout: 15000,
    })
    await page.waitForTimeout(1200)

    const text = await page.locator('table tbody tr').first().innerText()
    if (!text.includes(after.trim())) throw new Error('the edit did not persist into the row')
  })

  /*
   * Double-clicking must not move the grid.
   *
   * Focusing an editor scrolls it into view, so autofocusing a fixed column
   * yanked a horizontally scrolled grid back towards the start of the row the
   * moment you double-clicked - losing the place you had scrolled to. Raw
   * mouse events here on purpose: Playwright's own click scrolls the target
   * into view first, which would mask exactly what is being measured.
   */
  await step('editing a row does not move the grid sideways', async () => {
    const scroller = 'div.scroll-polished'
    await page.mouse.move(700, 400)
    await page.mouse.wheel(900, 0)
    await page.waitForTimeout(500)

    const read = () =>
      page.evaluate((sel) => Math.round(document.querySelector(sel).scrollLeft), scroller)
    const before = await read()
    if (before < 100) throw new Error('the grid did not scroll, so nothing is being tested')

    const box = await page.locator('table tbody tr').first().boundingBox()
    await page.mouse.dblclick(700, box.y + box.height / 2)
    await page.waitForTimeout(800)

    const after = await read()
    if (after !== before) throw new Error(`the grid moved from ${before} to ${after}`)

    // The caret belongs in the cell that was clicked, not in a fixed one.
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el?.closest('td')?.dataset?.column ?? null
    })
    const clicked = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('td')?.dataset?.column ?? null,
      [700, box.y + box.height / 2],
    )
    if (focused && clicked && focused !== clicked) {
      throw new Error(`focus landed in ${focused} after clicking ${clicked}`)
    }

    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.evaluate((sel) => {
      document.querySelector(sel).scrollLeft = 0
    }, scroller)
    await page.waitForTimeout(300)
  })

  await step('escape abandons an inline edit', async () => {
    const row = page.locator('table tbody tr').first()
    await row.dblclick()
    await page.waitForSelector('button[aria-label="Save changes"]', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    if (await page.locator('button[aria-label="Save changes"]').count()) {
      throw new Error('the row stayed in edit mode')
    }
  })

  /*
   * The deployment serves the app under a path prefix, and the pipeline
   * rewrites the address bar itself as filters change. If that rewrite drops
   * the prefix, every later Server Action posts to a path the proxy does not
   * route - saving stops working while every screen still renders. It looks
   * like a database fault and is not one, so it is asserted directly.
   */
  await step('inner pages keep the product in the tab', async () => {
    const title = await page.title()
    if (!title.endsWith(PRODUCT)) throw new Error(`tab reads "${title}"`)
  })

  await step('address bar keeps the deployment prefix', async () => {
    const prefix = new URL(BASE).pathname.replace(/\/$/, '')
    await page.click('table tbody tr')
    await page.waitForTimeout(300)
    const current = new URL(page.url()).pathname
    if (prefix && !current.startsWith(`${prefix}/`)) {
      throw new Error(`address bar lost the prefix: ${current}`)
    }
  })

  /*
   * A save driven from the pipeline page, which is the page that rewrites its
   * own URL. Deliberately submits a wrong current password: the point is to
   * prove the action reaches the server and answers, not to change anything.
   */
  await step('a save from the pipeline page reaches the server', async () => {
    await page.locator('header button').last().click()
    await page.waitForTimeout(300)
    await page.getByText(/change password/i).first().click()
    await page.waitForTimeout(400)
    const dialog = page.locator('[role="dialog"]')
    const inputs = dialog.locator('input')
    await inputs.nth(0).fill('DefinitelyNotIt1')
    await inputs.nth(1).fill('BrandNewPass9')
    await inputs.nth(2).fill('BrandNewPass9')
    await dialog.getByRole('button', { name: /change password/i }).click()
    await dialog.getByText(/not your current password/i).first().waitFor({ timeout: 15000 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
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

  /*
   * Which fields are mandatory is a business decision, not a styling one, so
   * it is asserted rather than eyeballed. S.No and Job No are mandatory too
   * but are generated on save, so they are not inputs and cannot be checked
   * here.
   */
  await step('only the agreed fields are mandatory', async () => {
    const REQUIRED = [
      'Sales responsible',
      'Customer name',
      'Project name',
      'Status',
      'Locations',
      'Materials',
      'Enquiry details',
      'Probability',
    ]
    const OPTIONAL = [
      'Quote value',
      'Contact person',
      'Expected order date',
      'Expected billing date',
      'Email',
      'Phone number',
      'Remarks',
    ]

    const marked = await page.$$eval('[role="dialog"] label', (els) =>
      els.map((el) => ({
        text: el.textContent?.replace(/\*$/, '').trim() ?? '',
        required: Boolean(el.querySelector('[data-required], .text-negative')) ||
          (el.textContent ?? '').trim().endsWith('*'),
      })),
    )
    const find = (name) => marked.find((m) => m.text.startsWith(name))

    for (const name of REQUIRED) {
      const field = find(name)
      if (!field) throw new Error(`"${name}" is not on the form`)
      if (!field.required) throw new Error(`"${name}" should be mandatory and is not marked`)
    }
    for (const name of OPTIONAL) {
      const field = find(name)
      if (field?.required) throw new Error(`"${name}" is marked mandatory and should not be`)
    }

    // The enquiry date is taken from the clock when the request is created and
    // is never chosen, so it must not appear on the form at all.
    if (find('Enquiry date')) throw new Error('the enquiry date is still a form field')

    // And the rules are enforced, not just advertised: saving an empty form
    // must be refused with the fields named.
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /^(Add request|Save changes)$/ })
      .click()
    await page.waitForTimeout(900)
    const summary = await page
      .locator('[role="dialog"]')
      .getByText(/correct the fields below/i)
      .count()
    if (summary === 0) throw new Error('an empty request was not refused')
  })

  /*
   * Picking a customer prefills the contact details. Picking a *different* one
   * has to replace them - the first version only filled an empty field, so
   * changing your mind about the customer left the previous one's email and
   * phone sitting on the request.
   */
  await step('contact details follow the customer', async () => {
    const dialog = page.locator('[role="dialog"]')
    const email = dialog.locator('input[name="email"]')

    const pick = async (index) => {
      // By position, not by label: the trigger's text becomes the selected
      // customer's name, so matching on the placeholder works only once.
      await dialog.locator('[role="combobox"]').first().click()
      await page.waitForTimeout(400)
      const rows = page.locator('[data-radix-popper-content-wrapper] button')
      const option = rows.nth(index)
      const name = (await option.innerText()).split('\n')[0].trim()
      await option.click()
      await page.waitForTimeout(500)
      return name
    }

    const first = await pick(0)
    const firstEmail = await email.inputValue()
    const second = await pick(1)
    const secondEmail = await email.inputValue()

    if (first === second) throw new Error('the two picks landed on the same customer')
    if (firstEmail === '' && secondEmail === '') {
      throw new Error('neither customer prefilled an email - cannot tell if it follows')
    }
    if (firstEmail === secondEmail) {
      throw new Error(`email stayed "${firstEmail}" after switching from ${first} to ${second}`)
    }
  })

  await step('inline customer create asks for contact details', async () => {
    // By position: the previous step selected a customer, so the trigger now
    // shows that name rather than the placeholder.
    await page.locator('[role="dialog"] [role="combobox"]').first().click()
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

  /*
   * Job numbers read <prefix><number>_<suffix>. The three parts are company
   * settings, so the screen that sets them has to show what they combine into.
   */
  await step('job number format is set per company', async () => {
    await page.goto(`${BASE}/admin/companies`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await page.locator('button[aria-label^="Edit"], button:has-text("Edit")').first().click()
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await page.waitForTimeout(400)

    const dialog = page.locator('[role="dialog"]')
    const labels = await dialog.locator('label').allInnerTexts()
    for (const needed of ['Job number prefix', 'Country code']) {
      if (!labels.some((label) => label.includes(needed))) {
        throw new Error(`"${needed}" is missing from the company form`)
      }
    }

    await dialog.locator('input[name="jobNoPrefix"]').fill('J')
    await dialog.locator('input[name="jobNoSuffix"]').fill('DXB')
    await page.waitForTimeout(400)
    const preview = await dialog.getByText(/Next job number:/).innerText()
    if (!/J\d+_DXB/.test(preview)) throw new Error(`preview reads "${preview}"`)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    // The dialog may ask about unsaved changes; leave without saving.
    const discard = page.getByRole('button', { name: /discard|leave|yes/i })
    if (await discard.count()) await discard.first().click()
    await page.waitForTimeout(400)
  })

  const createUserStep = async () => {
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

    /*
     * Assign whichever company exists, found through the Companies field
     * itself rather than by name. Naming one ties the check to a particular
     * installation's data; hunting for "a button with a capital letter" picks
     * up the Role selector instead, which is what it did.
     */
    // Substring, not an anchored pattern: the button wraps the name in a
    // colour dot and a checkbox, so its text carries surrounding whitespace.
    const companyOption = page
      .locator('[role=dialog] button')
      .filter({ hasText: companyName })
      .first()
    await companyOption.waitFor({ timeout: 8000 })
    await companyOption.click()
    await page.waitForTimeout(500)
    await page.click('button:has-text("Create user")')
    await page.waitForTimeout(2500)

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' })
    const created = page.locator(`text=Zed Tester ${stamp}`)
    await created.first().waitFor({ timeout: 10000 })
    createdUserStamp = stamp
  }

  /*
   * Editing a user, saved.
   *
   * The form used to validate against the server's update schema, which also
   * requires the user's id - a value the screen supplies and no control is
   * bound to. Every save failed on it, and because nothing renders that field
   * the error had nowhere to appear: the dialog simply did nothing. Only a
   * save catches that, which is why this step exists.
   */
  const editUserStep = async () => {
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    const name = `Zed Tester ${createdUserStamp}`
    await page.locator(`text=${name}`).first().waitFor({ timeout: 10000 })
    await page.click(`button[aria-label="Edit ${name}"]`)
    await page.waitForSelector('text=Edit user', { timeout: 8000 })
    await page.waitForTimeout(400)

    const renamed = `${name} R`
    await page.fill('#user-name', renamed)
    await page.click('[role=dialog] button:has-text("Save")')

    // The dialog must close of its own accord: if validation quietly refused,
    // it stays open with nothing said, which is exactly the bug.
    await page.waitForSelector('text=Edit user', { state: 'detached', timeout: 12000 })
    await page.waitForTimeout(1500)

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' })
    await page.locator(`text=${renamed}`).first().waitFor({ timeout: 10000 })
  }

  /*
   * The only steps that create or change a record, so the only ones that must
   * not run against the live system. The screens themselves are still opened
   * by the read-only pass above.
   */
  if (ALLOW_WRITES) {
    await step('create a user end to end', createUserStep)
    await step('edit a user and save', editUserStep)
  } else {
    skip('create a user end to end', 'read-only: it would add a real user')
    skip('edit a user and save', 'read-only: it would change a real user')
  }

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

  /*
   * Last, because it ends the session.
   *
   * Auth.js resolves the sign-out callback against the origin it believes it
   * is serving. Behind the proxy, Next's standalone server reports the address
   * it binds to - so a misconfigured deployment sends the browser to
   * http://0.0.0.0:3000 and the user is simply stranded. Asserting the landing
   * URL catches that; asserting that sign-out "worked" would not.
   */
  await step('sign out returns to this site', async () => {
    await page.goto(`${BASE}/select-company`, { waitUntil: 'networkidle' })
    // The company chooser signs out directly; no account menu to open first.
    await page.getByRole('button', { name: /sign out/i }).first().click()
    await page.waitForURL(/\/login/, { timeout: 20000 })
    const landed = new URL(page.url())
    const expected = new URL(BASE)
    if (landed.origin !== expected.origin) {
      throw new Error(`landed on ${landed.origin}, expected ${expected.origin}`)
    }
    if (!landed.pathname.startsWith(expected.pathname.replace(/\/$/, ''))) {
      throw new Error(`landed on ${landed.pathname}`)
    }
  })

  await browser.close()

  return report()
}

/** Print what went wrong, and set the exit code. Every path ends here. */
function report() {
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
