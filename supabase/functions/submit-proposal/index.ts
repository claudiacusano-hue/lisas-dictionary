import { createClient } from '@supabase/supabase-js'
import { createSubmitHandler } from '../_shared/submit-handler.ts'
import type { VocabularyTerm } from '../_shared/domain.ts'

const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Configurare ${name}`)
  return value
}
const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const salt = required('RATE_LIMIT_SALT')
const secret = required('TURNSTILE_SECRET_KEY')
const hostnames = required('TURNSTILE_HOSTNAMES')
  .split(',')
  .map((s) => s.trim())
const handler = createSubmitHandler({
  origins: required('ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim()),
  enabled: Deno.env.get('CONTRIBUTIONS_ENABLED') === 'true',
  ipHeader: Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for',
  hashIp: async (ip) => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(salt),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  },
  rateLimit: async (key, limit, seconds) => {
    const { data, error } = await db.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: seconds,
    })
    if (error) throw error
    return data === true
  },
  verifyCaptcha: async (token, ip) => {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return false
    const result = await response.json()
    return (
      result.success === true &&
      result.action === 'contribution' &&
      hostnames.includes(result.hostname)
    )
  },
  vocabulary: async () => {
    const fields = await db.from('vocabulary_fields').select('*')
    if (fields.error || !fields.data) throw new Error('Vocabolario non disponibile')
    const terms: VocabularyTerm[] = []
    for (let offset = 0; ; offset += 1000) {
      const page = await db
        .from('vocabulary_terms')
        .select('*')
        .eq('active', true)
        .order('field_code')
        .order('code')
        .range(offset, offset + 999)
      if (page.error || !page.data) throw new Error('Vocabolario non disponibile')
      terms.push(...page.data)
      if (page.data.length < 1000) break
    }
    return { fields: fields.data, terms }
  },
  save: async (proposal) => {
    const { data, error } = await db.rpc('submit_proposal', { p_input: proposal })
    if (error || !data) throw new Error('Salvataggio fallito')
    return data as string
  },
})
Deno.serve(handler)
