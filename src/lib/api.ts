import { createClient } from '@supabase/supabase-js'
import type {
  Filter,
  Proposal,
  ProposalInput,
  AdminProposalInput,
  ProposalStatus,
  Revision,
  SignDetail,
  SignSummary,
  VocabularyField,
  VocabularyTerm,
  SignDocument,
} from '../../supabase/functions/_shared/domain'

const env = import.meta.env
export const configuration = {
  url: (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, ''),
  key: (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim(),
  captchaKey: env.VITE_TURNSTILE_SITE_KEY || '',
  controller: env.VITE_PRIVACY_CONTROLLER || '',
  contact: env.VITE_PRIVACY_CONTACT || '',
  retention: env.VITE_PRIVACY_RETENTION || '',
  contributions: env.VITE_CONTRIBUTIONS_ENABLED === 'true',
}
function safePublicKey(key: string) {
  if (key.startsWith('sb_secret_')) return false
  if (key.startsWith('sb_publishable_')) return true
  try {
    return JSON.parse(atob(key.split('.')[1])).role === 'anon'
  } catch {
    return false
  }
}
function safeDatabaseUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}
export const configured = Boolean(
  safeDatabaseUrl(configuration.url) && configuration.key && safePublicKey(configuration.key),
)
export const contributionsOpen =
  configured &&
  configuration.contributions &&
  Boolean(
    configuration.captchaKey &&
    configuration.controller &&
    configuration.contact &&
    configuration.retention,
  )
export const supabase = configured
  ? createClient(configuration.url, configuration.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
const client = () => {
  if (!supabase) throw new Error('Il catalogo non è ancora collegato.')
  return supabase
}
const checked = <T>(result: { data: T; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export async function vocabulary() {
  if (!supabase) return { fields: [] as VocabularyField[], terms: [] as VocabularyTerm[] }
  const fields = checked(
    await supabase.from('vocabulary_fields').select('*').order('code'),
  ) as VocabularyField[]
  const terms: VocabularyTerm[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = checked(
      await supabase
        .from('vocabulary_terms')
        .select('*')
        .order('field_code')
        .order('code')
        .range(offset, offset + 999),
    ) as VocabularyTerm[]
    terms.push(...page)
    if (page.length < 1000) break
  }
  return { fields, terms }
}
export async function searchSigns(
  query = '',
  filters: Filter[] = [],
  offset = 0,
  limit = 24,
): Promise<{ total: number; results: SignSummary[] }> {
  if (!supabase) return { total: 0, results: [] }
  return checked(
    await supabase.rpc('search_signs', {
      p_query: query,
      p_filters: filters,
      p_offset: offset,
      p_limit: limit,
    }),
  )
}
export async function getSign(id: string): Promise<SignDetail | null> {
  return checked(await client().rpc('get_sign', { p_id: id }))
}
export async function submitProposal(
  proposal: ProposalInput,
  token: string,
  website: string,
): Promise<string> {
  const response = await fetch(`${configuration.url}/functions/v1/submit-proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: configuration.key },
    body: JSON.stringify({ proposal, turnstile_token: token, website }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.id)
    throw new Error(result?.message || 'Il servizio non risponde. Riprova più tardi.')
  return result.id
}
export const submitAdminProposal = async (proposal: AdminProposalInput): Promise<string> =>
  checked(await client().rpc('submit_admin_proposal', { p_input: proposal }))
export async function proposals(status: ProposalStatus | 'all', kind: string, offset = 0) {
  let q = client()
    .from('proposals')
    .select('*', { count: 'exact' })
    .order('created_at')
    .range(offset, offset + 24)
  if (status !== 'all') q = q.eq('status', status)
  if (kind !== 'all') q = q.eq('kind', kind)
  const result = await q
  if (result.error) throw new Error(result.error.message)
  return { results: result.data as Proposal[], total: result.count || 0 }
}
export const getProposal = async (id: string): Promise<Proposal> =>
  checked(await client().from('proposals').select('*').eq('id', id).single()) as Proposal
export const revisions = async (id: string): Promise<Revision[]> =>
  checked(
    await client()
      .from('revisions')
      .select('*')
      .eq('proposal_id', id)
      .order('created_at', { ascending: false }),
  ) as Revision[]
export const editProposal = async (
  p: Proposal,
  document: SignDocument,
  reason: string,
  base: number | null,
) =>
  checked(
    await client().rpc('edit_proposal', {
      p_id: p.id,
      p_version: p.version,
      p_document: document,
      p_reason: reason,
      p_base_revision: base,
    }),
  )
export const moderate = async (p: Proposal, action: string, reason: string) =>
  checked(
    await client().rpc('moderate_proposal', {
      p_id: p.id,
      p_version: p.version,
      p_action: action,
      p_reason: reason,
    }),
  )
export const reviewTerm = async (
  t: VocabularyTerm,
  active: boolean,
  label: string,
  reason: string,
) =>
  checked(
    await client().rpc('review_vocabulary', {
      p_field: t.field_code,
      p_code: t.code,
      p_active: active,
      p_label: label,
      p_reason: reason,
    }),
  )
export interface ImportContext {
  batch_sha256: string
  source_id: string
  original_lisas: unknown
  warnings: string[]
}
export const getImportContext = async (id: string): Promise<ImportContext | null> =>
  checked(await client().rpc('get_import_context', { p_proposal: id }))
