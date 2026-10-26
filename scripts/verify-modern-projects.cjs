const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { mkdirSync } = require('node:fs')

// All API calls are intercepted: this test never opens real projects or invokes a model.
async function main() {
  const projects = Array.from({ length: 28 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Project ${index + 1}`,
    rootPaths: [index < 2 ? '/workspace/shared' : `/workspace/project-${index + 1}`],
  }))
  const threads = [{
    id: 'fixture-thread', cwd: '/workspace/shared', preview: 'Explicit project membership',
    createdAt: 1793000000, updatedAt: 1793000000, source: 'cli', modelProvider: 'openai', turns: [],
  }]
  const browser = await chromium.launch({ headless: true })
  mkdirSync('output/playwright', { recursive: true })
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      await context.addInitScript((value) => localStorage.setItem('codex-web-local.dark-mode.v1', value), theme)
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/codex-api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname
        let result = { data: {} }
        if (pathname === '/codex-api/workspace-roots-state') {
          result = { data: { order: ['/legacy'], labels: {}, active: [], projectOrder: [], remoteProjects: [], projects, threadProjectIds: { 'fixture-thread': projects[1].id } } }
        } else if (pathname === '/codex-api/rpc') {
          const body = route.request().postDataJSON()
          result = { result: {} }
          if (body.method === 'thread/list') result.result = { data: threads, nextCursor: null }
          if (body.method === 'thread/read') result.result = { thread: threads[0] }
          if (body.method === 'model/list') result.result = { data: [], nextCursor: null }
          if (body.method === 'account/rateLimits/read') result.result = null
        } else if (pathname === '/codex-api/provider-models') result = { data: [], exclusive: true }
        else if (pathname === '/codex-api/events') {
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture\n\n' })
        }
        await route.fulfill({ json: result })
      })
      await page.goto('http://127.0.0.1:4173/')
      const groups = page.locator('.project-group')
      await groups.nth(27).waitFor({ state: 'attached' })
      assert.equal(await groups.count(), 28)
      assert.match(await page.locator(`[data-project-name="${projects[1].id}"]`).innerText(), /Explicit project membership/)
      assert.doesNotMatch(await page.locator(`[data-project-name="${projects[0].id}"]`).innerText(), /Explicit project membership/)
      await page.reload()
      await groups.nth(27).waitFor({ state: 'attached' })
      assert.equal(await groups.count(), 28)
      assert.equal(await page.locator('html').evaluate((element) => element.classList.contains('dark')), theme === 'dark')
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `output/playwright/modern-projects-${theme}.png` })
      assert.deepEqual(errors, [])
      console.log(`${theme}: 28 projects, explicit membership, reload, no page errors`)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
