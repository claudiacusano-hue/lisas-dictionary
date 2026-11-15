import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { documentFixture, fields, terms } from '../fixtures'

test.use({ baseURL: 'http://127.0.0.1:4175' })
test.setTimeout(60_000)

const signId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const proposalId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const user = {
  id: userId,
  email: 'reviewer@example.org',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-11-15T09:00:00Z',
}

async function authenticate(page: Page, admin = true) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, exp: 4102444800, aud: 'authenticated', role: 'authenticated' })}.fixture`
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
  await page.route('https://lisas-test.supabase.co/auth/v1/user', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) }),
  )
  await page.route('https://lisas-test.supabase.co/rest/v1/rpc/is_admin', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(admin) }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('https://lisas-test.supabase.co/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path.endsWith('/vocabulary_fields')) body = fields
    else if (path.endsWith('/vocabulary_terms')) body = terms
    else if (path.endsWith('/get_sign'))
      body = { id: signId, gloss: 'VOCE DI TEST', revision: 3, document: documentFixture() }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
})

test('raccolta chiusa: avviso prima della compilazione e accesso riservato con scheda conservata', async ({
  page,
}) => {
  await page.goto(`/#/contribuisci?segno=${signId}&tipo=completion`)
  await expect(
    page.getByRole('heading', { name: 'I contributi pubblici non sono ancora aperti.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continua', exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /Ho letto/ })).toHaveCount(0)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('link', { name: 'Accedi per contribuire come revisore' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/contribuisci\\?segno=${signId}&tipo=completion`))
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continua', exact: true })).toHaveCount(0)
})

for (const kind of ['completion', 'correction']) {
  test(`revisore: ${kind} salvata con vocabolari approvati anche a raccolta pubblica chiusa`, async ({
    page,
  }) => {
    await authenticate(page)
    let calls = 0
    let captchaRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('challenges.cloudflare.com')) captchaRequests++
    })
    await page.route(
      'https://lisas-test.supabase.co/rest/v1/rpc/submit_admin_proposal',
      async (route) => {
        calls++
        expect(route.request().postDataJSON()).toMatchObject({
          p_input: {
            kind,
            target_id: signId,
            base_revision: 3,
            notes: 'Integrazione verificata nella fonte di test',
            document: {
              variants: [
                {
                  annotations: expect.arrayContaining([
                    expect.objectContaining({
                      field_code: 'cnm_mouth',
                      term_code: 'TEST_MOUTH',
                      state: 'documented',
                    }),
                  ]),
                },
              ],
            },
          },
        })
        expect(route.request().postDataJSON().p_input).not.toHaveProperty('consent')
        expect(route.request().postDataJSON().p_input).not.toHaveProperty('email')
        await route.fulfill(
          calls === 1
            ? {
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Servizio temporaneamente non disponibile' }),
              }
            : { contentType: 'application/json', body: JSON.stringify(proposalId) },
        )
      },
    )
    await page.goto(`/#/contribuisci?segno=${signId}&tipo=${kind}`)
    await page.getByRole('link', { name: 'Accedi per contribuire come revisore' }).click()
    await expect(page.getByText('Scheda selezionata:')).toContainText('VOCE DI TEST')
    await page.getByRole('button', { name: 'Continua', exact: true }).click()
    await page
      .getByRole('combobox', { name: 'Stato di Bocca', exact: true })
      .selectOption('documented')
    await page.getByRole('checkbox', { name: 'Bocca di test', exact: true }).check()
    await page
      .getByLabel('Motivazione (richiesta)')
      .fill('Integrazione verificata nella fonte di test')
    await page.getByRole('button', { name: 'Rivedi la proposta', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: /Ho letto/ })).toHaveCount(0)
    const save = page.getByRole('button', { name: 'Salva la proposta', exact: true })
    await expect(save).toBeEnabled()
    await page.screenshot({
      path: `test-results/admin-${kind}-${test.info().project.name}.png`,
      fullPage: true,
    })
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await save.click()
    await expect(
      page.getByText('Servizio temporaneamente non disponibile', { exact: true }),
    ).toBeVisible()
    await expect(save).toBeEnabled()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Bocca di test', exact: true })).toBeChecked()
    await expect(page.getByLabel('Motivazione (richiesta)')).toHaveValue(
      'Integrazione verificata nella fonte di test',
    )
    await page.getByRole('button', { name: 'Rivedi la proposta', exact: true }).click()
    await save.click()
    await expect(page.getByRole('heading', { name: 'Grazie per il tuo contributo.' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Apri la proposta da revisionare' }),
    ).toHaveAttribute('href', `#/admin/proposte/${proposalId}`)
    expect(calls).toBe(2)
    expect(captchaRequests).toBe(0)
  })
}

test('un account senza ruolo di revisore non accede al modulo amministrativo', async ({ page }) => {
  await authenticate(page, false)
  await page.goto(`/#/admin/contribuisci?segno=${signId}&tipo=completion`)
  await page.locator('.loading').waitFor({ state: 'hidden' })
  await expect(page.getByText(/Il tuo account non ha il ruolo di amministratore/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continua', exact: true })).toHaveCount(0)
})
