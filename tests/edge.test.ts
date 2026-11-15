import { describe, expect, it, vi } from 'vitest'
import {
  createSubmitHandler,
  type SubmitDependencies,
} from '../supabase/functions/_shared/submit-handler'
import { fields, terms, proposalFixture } from './fixtures'

function setup(overrides: Partial<SubmitDependencies> = {}) {
  const deps: SubmitDependencies = {
    origins: ['https://example.org'],
    enabled: true,
    ipHeader: 'x-forwarded-for',
    hashIp: async () => 'hash-test',
    rateLimit: async () => true,
    verifyCaptcha: async () => true,
    vocabulary: async () => ({ fields, terms }),
    save: vi.fn(async () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ...overrides,
  }
  const handler = createSubmitHandler(deps)
  const request = (
    body: unknown = { proposal: proposalFixture(), turnstile_token: 'test-token', website: '' },
    headers: Record<string, string> = {},
  ) =>
    new Request('https://project.supabase.co/functions/v1/submit-proposal', {
      method: 'POST',
      headers: {
        origin: 'https://example.org',
        'content-type': 'application/json',
        'x-forwarded-for': '192.0.2.1',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  return { deps, handler, request }
}
describe('endpoint pubblico', () => {
  it('salva solo dopo captcha e validazione, restituendo una ricevuta', async () => {
    const { deps, handler, request } = setup()
    const response = await handler(request())
    expect(response.status).toBe(201)
    expect(deps.save).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.org')
  })
  it('blocca captcha fallito, rate limit, honeypot e valori inventati senza scrivere', async () => {
    for (const override of [
      { verifyCaptcha: async () => false },
      { rateLimit: async () => false },
    ]) {
      const { deps, handler, request } = setup(override)
      expect((await handler(request())).status).toBeGreaterThanOrEqual(400)
      expect(deps.save).not.toHaveBeenCalled()
    }
    const { deps, handler, request } = setup()
    expect(
      (
        await handler(
          request({ proposal: proposalFixture(), turnstile_token: 'test', website: 'spam' }),
        )
      ).status,
    ).toBe(400)
    const p = proposalFixture()
    p.document.variants[0].annotations[0].term_code = 'inventato'
    expect(
      (await handler(request({ proposal: p, turnstile_token: 'test', website: '' }))).status,
    ).toBe(400)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('limita il body anche senza Content-Length', async () => {
    const { deps, handler, request } = setup()
    expect((await handler(request({ text: 'a'.repeat(70000) }))).status).toBe(413)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('rifiuta origini estranee e chiude la raccolta se non configurata', async () => {
    const { handler, request } = setup()
    expect((await handler(request(undefined, { origin: 'https://attacker.example' }))).status).toBe(
      403,
    )
    const closed = setup({ enabled: false })
    expect((await closed.handler(closed.request())).status).toBe(503)
  })
  it('non espone errori interni o dati personali', async () => {
    const { handler, request } = setup({
      save: async () => {
        throw new Error('secret@example.org service_role')
      },
    })
    const res = await handler(request())
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('service_role')
  })
})
