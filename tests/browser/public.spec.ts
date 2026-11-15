import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { fields, terms, documentFixture } from '../fixtures'

const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const summary = {
  id,
  gloss: 'VOCE DI TEST',
  category: 'nome',
  description: 'Fixture tecnica per le verifiche del browser.',
  revision: 1,
  updated_at: '2026-11-15T09:00:00Z',
  completeness: 40,
  variant_count: 1,
}
async function backend(page: Page) {
  await page.route('https://lisas-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    let body: unknown = []
    if (url.pathname.endsWith('/vocabulary_fields')) body = fields
    else if (url.pathname.endsWith('/vocabulary_terms')) body = terms
    else if (url.pathname.endsWith('/search_signs')) {
      const input = route.request().postDataJSON()
      body =
        input.p_query === 'NESSUN RISULTATO'
          ? { total: 0, results: [] }
          : { total: 1, results: [summary] }
    } else if (url.pathname.endsWith('/get_sign'))
      body = { ...summary, document: documentFixture() }
    else if (url.pathname.endsWith('/submit-proposal'))
      body = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', message: 'Ricevuta' }
    else if (url.pathname.endsWith('/auth/v1/user'))
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"message":"Sessione assente"}',
      })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:function(el,options){el.textContent="Controllo antispam di test";setTimeout(()=>options.callback("test-token"),10);return "test-widget";},remove:function(){}};',
    }),
  )
}
test.beforeEach(async ({ page }) => {
  await backend(page)
})
test('navigazione, ricerca e stato vuoto', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Ogni segno/ })).toBeVisible()
  await page.getByRole('searchbox').fill('NESSUN RISULTATO')
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nessun segno con questi criteri' })).toBeVisible()
  await page.getByRole('button', { name: 'Azzera la ricerca', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'VOCE DI TEST', exact: true })).toBeVisible()
})
test('filtri combinati nell’URL e richiesta alla stessa ricerca', async ({ page }) => {
  await page.goto('/#/esplora?avanzata=1')
  await page
    .getByRole('combobox', { name: /^Configurazione/ })
    .selectOption({ label: 'Configurazione di test' })
  await page.getByRole('combobox', { name: /^Luogo/ }).selectOption({ label: 'Luogo di test' })
  await expect(page).toHaveURL(/configuration=/)
  const request = page.waitForRequest(
    (r) =>
      r.url().endsWith('/search_signs') &&
      r.postDataJSON().p_filters.some((f: { phase?: string }) => f.phase === 'final'),
  )
  await page.getByText('Dettagli: mano, fase e configurazione', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Fase', exact: true }).selectOption('final')
  expect((await request).postDataJSON().p_filters).toHaveLength(2)
})
test('scheda e stato mancante esplicito, senza JSON pubblico', async ({ page }) => {
  await page.goto(`/#/segni/${id}`)
  await expect(page.getByRole('heading', { name: 'VOCE DI TEST', exact: true })).toBeVisible()
  await expect(page.getByText('Non ancora documentato', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.document-view')).not.toContainText('field_code')
})
test('modulo guidato e ricevuta dopo invio', async ({ page }) => {
  await page.goto('/#/contribuisci')
  await page.getByRole('button', { name: 'Continua', exact: true }).click()
  await page.getByLabel('Glossa italiana', { exact: false }).fill('NUOVA VOCE TEST')
  await page.getByLabel(/^Provenienza dei dati/).fill('Fonte tecnica di test')
  await page.getByRole('button', { name: 'Rivedi la proposta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'NUOVA VOCE TEST', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /Ho letto/ }).check()
  await page.getByRole('button', { name: 'Invia la proposta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Grazie per il tuo contributo.' })).toBeVisible()
  await expect(
    page.getByText('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', { exact: true }),
  ).toBeVisible()
})
test('accesso amministrativo separato dalla consultazione', async ({ page }) => {
  await page.goto('/#/admin')
  await expect(page.getByRole('heading', { name: 'Amministrazione', exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByText('Pannello di revisione', { exact: true })).not.toBeVisible()
})
test('revisione amministrativa: confronto, decisione motivata e cronologia', async ({ page }) => {
  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const proposalId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const user = {
    id: adminId,
    email: 'admin@example.org',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-11-15T09:00:00Z',
  }
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: adminId, exp: 4102444800, aud: 'authenticated', role: 'authenticated' })}.fixture`
  await page.addInitScript(
    (session) => localStorage.setItem('sb-lisas-test-auth-token', JSON.stringify(session)),
    {
      access_token: token,
      refresh_token: 'test-refresh',
      expires_at: 4102444800,
      expires_in: 3600,
      token_type: 'bearer',
      user,
    },
  )
  const proposal = {
    id: proposalId,
    kind: 'new_sign',
    target_id: null,
    base_revision: null,
    document: documentFixture(),
    original_document: documentFixture(),
    notes: 'Nota privata di test',
    email: null,
    status: 'pending',
    version: 1,
    created_at: '2026-11-15T09:00:00Z',
  }
  await page.route('https://lisas-test.supabase.co/auth/v1/user', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) }),
  )
  await page.route('https://lisas-test.supabase.co/rest/v1/rpc/is_admin', (route) =>
    route.fulfill({ contentType: 'application/json', body: 'true' }),
  )
  await page.route('https://lisas-test.supabase.co/rest/v1/proposals*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(
        new URL(route.request().url()).searchParams.has('id') ? proposal : [proposal],
      ),
    }),
  )
  await page.route('https://lisas-test.supabase.co/rest/v1/rpc/get_import_context', (route) =>
    route.fulfill({ contentType: 'application/json', body: 'null' }),
  )
  await page.route(
    'https://lisas-test.supabase.co/rest/v1/rpc/moderate_proposal',
    async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        p_id: proposalId,
        p_version: 1,
        p_action: 'approved',
        p_reason: 'Fonte verificata nel test',
      })
      proposal.status = 'approved'
      proposal.version = 2
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(id) })
    },
  )
  await page.goto('/#/admin')
  await page.getByRole('link', { name: /Nuovo segno VOCE DI TEST/ }).click()
  await expect(page.getByRole('heading', { name: 'Dati della nuova scheda' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByLabel('Motivazione (richiesta)').fill('Fonte verificata nel test')
  await page.getByRole('button', { name: 'Approva e pubblica', exact: true }).click()
  await expect(page.getByText('Nuovo segno · Approvata', { exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
test('pagine principali accessibili e senza overflow orizzontale', async ({ page }) => {
  for (const path of [
    '/',
    '/#/esplora?avanzata=1',
    `/#/segni/${id}`,
    '/#/contribuisci',
    '/#/admin',
  ]) {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    await page.locator('.loading').waitFor({ state: 'hidden' })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations,
      JSON.stringify(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ),
    ).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
  await page.goto('/')
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  })
})
